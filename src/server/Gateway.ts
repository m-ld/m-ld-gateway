import {
  GraphSubject, MeldClone, MeldConfig, MeldReadState, MeldUpdate, propertyValue, Reference, uuid
} from '@m-ld/m-ld';
import {
  AccountOwnedId, AuthKeyStore, BaseGateway, BaseGatewayConfig, CloneFactory, Env, GatewayPrincipal
} from '../lib/index.js';
import { gatewayContext, Iri, UserKey } from '../data/index.js';
import LOG from 'loglevel';
import { access, rm, writeFile } from 'fs/promises';
import { finalize, Subscription } from 'rxjs';
import { ConflictError, UnauthorizedError } from '../http/errors.js';
import { GatewayConfig } from './index.js';
import { Bite, Consumable } from 'rx-flowable';
import { Account, AccountContext } from './Account.js';
import { accountHasSubdomain } from './statements.js';
import { SubdomainClone } from './SubdomainClone.js';
import { randomInt } from 'crypto';
import jsonwebtoken, { JwtPayload } from 'jsonwebtoken';
import Cryptr from 'cryptr';

export type Who = { acc: Account, keyid: string };

export class Gateway extends BaseGateway implements AccountContext {
  readonly me: GatewayPrincipal;
  /*readonly*/
  domain: MeldClone;

  private readonly config: GatewayConfig;
  private readonly subdomains: { [name: string]: SubdomainClone } = {};
  private readonly subs: Subscription = new Subscription();

  // noinspection JSUnusedGlobalSymbols keyStore is in account context
  constructor(
    private readonly env: Env,
    config: Partial<GatewayConfig>,
    private readonly cloneFactory: CloneFactory,
    readonly keyStore: AuthKeyStore
  ) {
    if (!config['@domain'])
      throw new RangeError('No domain specified for Gateway');
    if (!config.auth)
      throw new RangeError('No auth key specified for Gateway');
    if (!config.gateway)
      throw new RangeError('No gateway address specified for Gateway');
    super(config['@domain']);
    LOG.debug('Gateway domain is', this.domainName);
    const id = uuid();
    LOG.info('Gateway ID is', id);
    this.config = {
      // Overridable by config
      '@context': gatewayContext, genesis: false,
      ...config,
      '@id': id // Not overrideable
    } as GatewayConfig;
    this.me = new GatewayPrincipal(this.absoluteId('/'), this.config);
  }

  async initialise() {
    // Load the gateway domain
    const dataDir = await this.env.readyPath('data', 'gw');
    [this.domain] = await this.cloneFactory.clone(this.config, dataDir);
    await this.domain.status.becomes({ outdated: false });
    // Create the gateway account with our key, if it doesn't exist
    await this.domain.write(
      new Account(this, {
        name: this.rootAccountName, keyids: [this.me.authKey.keyid]
      }).toJSON()
    );
    // Enliven all subdomains and connectors already in the domain
    await new Promise(resolve => {
      this.subs.add(this.domain.read(
        state => this.initDomain(state).then(resolve),
        (update, state) => this.onUpdateDomain(update, state).then()
      ));
    });
    return this;
  }

  // TODO: use polymorphism for this
  get usingUserKeys() {
    return 'key' in this.config;
  }

  get rootAccountName() {
    return this.me.authKey.appId.toLowerCase();
  }

  initDomain(state: MeldReadState) {
    // Subdomains are the range of the 'subdomain' Account property
    return this.readAsync(state.read({
      '@select': '?d', '@where': { 'subdomain': '?d' }
    }).consume, ({ value, next }) => {
      this.subdomainAdded(this.ownedRefAsId(<Reference>value['?d'])).finally(next);
    });
  }
  onUpdateDomain(update: MeldUpdate, _state: MeldReadState) {
    return this.onUpdateSubdomains(update);
  }

  onUpdateSubdomains(update: MeldUpdate) {
    // Watch for subdomains appearing and disappearing
    // noinspection JSCheckFunctionSignatures
    return Promise.all([
      ...update['@delete'].map(subject => Promise.all(
        propertyValue(subject, 'subdomain', Array, Reference).map(tsRef =>
          this.subdomainRemoved(this.ownedRefAsId(tsRef))))),
      ...update['@insert'].map(subject => Promise.all(
        propertyValue(subject, 'subdomain', Array, Reference).map(tsRef =>
          this.subdomainAdded(this.ownedRefAsId(tsRef)))))
    ]);
  }

  /**
   * Hoop-jumping to ensure that an asynchronous read does not throw an
   * unhandled exception if the gateway is closed too soon.
   */
  readAsync(results: Consumable<GraphSubject>, sub: (value: Bite<GraphSubject>) => void) {
    return new Promise<void>(resolve => {
      // noinspection JSCheckFunctionSignatures
      this.subs.add(results.pipe(finalize(resolve)).subscribe(sub));
    });
  }

  // TODO: implement this in timeld
  onUpdateSubdomain(
    _id: AccountOwnedId,
    _update: MeldUpdate,
    _state: MeldReadState
  ): Promise<void> {
    return Promise.resolve();
  }

  /**
   * @param sd
   * @param iri gateway-relative or absolute IRI
   * @param type note vocabulary is common between gw and ts
   * @param key
   */
  async writePrincipalToSubdomain(
    sd: SubdomainClone,
    iri: Iri,
    type: 'Account' | 'Gateway',
    key: UserKey
  ) {
    await sd.write({
      '@id': this.absoluteId(iri),
      '@type': type,
      key: key.toJSON(true)
    });
    await sd.unlock();
  }

  getDataPath(id: AccountOwnedId) {
    return this.env.readyPath('data', 'domain', id.account, id.name);
  }

  async subdomainAdded(id: AccountOwnedId) {
    if (!(id.toDomain() in this.subdomains)) {
      try {
        await this.cloneSubdomain(id);
        LOG.info('Loaded declared subdomain', id);
      } catch (e) {
        // If the clone fails that's fine, we'll try again if it's asked for
        LOG.warn('Failed to load declared subdomain', id, e);
      }
    }
  }

  async subdomainRemoved(id: AccountOwnedId) {
    try {
      await this.subdomains[id.toDomain()]?.close();
      const path = await this.getDataPath(id);
      // Remove the persistent data
      await rm(path, { recursive: true, force: true });
      // Write the tombstone file to prevent re-creation
      await writeFile(`${path}.rip`, '');
      // TODO: Remove all channel permissions
      delete this.subdomains[id.toDomain()];
      LOG.info('Removed declared subdomain', id);
    } catch (e) {
      LOG.warn('Error removing declared subdomain', id, e);
    }
  }

  async tsTombstoneExists(id: AccountOwnedId) {
    const path = await this.getDataPath(id);
    return access(`${path}.rip`).then(() => true, () => false);
  }

  /**
   * @param account name
   * @param [orCreate] allow creation of new account
   */
  async account(account: string, orCreate: true): Promise<Account>;
  async account(account: string, orCreate?: false): Promise<Account | undefined>;
  async account(account: string, orCreate = false) {
    let acc: Account | undefined;
    await this.domain.write(async state => {
      const src = await state.get(account);
      if (src != null) {
        acc = Account.fromJSON(this, src);
      } else if (orCreate) {
        acc = new Account(this, { name: account });
        await state.write(acc.toJSON());
      }
    });
    return acc;
  }

  /**
   * @param user name
   * @param email
   */
  async activation(user: string, email: string): Promise<{ code: string, jwe: string }> {
    // If the account exists, check the email is registered
    const acc = await this.account(user);
    if (acc != null && !acc.emails.has(email))
      throw new UnauthorizedError(
        'Email %s not registered to account %s', email, user);
    // Construct a JWT with the email, using our authorisation key
    const { secret, keyid } = this.me.authKey;
    const jwt = jsonwebtoken.sign({ email }, secret, {
      keyid, expiresIn: '10m', subject: user
    });
    // Encrypt the JWT with the activation code
    const code = randomInt(111111, 1000000).toString(10);
    const jwe = new Cryptr(code).encrypt(jwt);
    return { jwe, code };
  }

  /**
   * Verify the JWT was an activation created by us
   * @param code an activation code created by this Gateway
   * @param jwe a corresponding encrypted JWT
   */
  verifyActivation(code: string, jwe: string) {
    const jwt = new Cryptr(code).decrypt(jwe);
    const { sub, email } =
      jsonwebtoken.verify(jwt, this.me.authKey.secret) as JwtPayload;
    return { user: sub, email };
  }

  /**
   * Gets the m-ld configuration for a subdomain. Calling this method will
   * create the subdomain if it does not already exist.
   *
   * The caller must have already checked user access to the subdomain.
   */
  async subdomainConfig(
    id: AccountOwnedId,
    { acc: user, keyid }: Who
  ): Promise<Partial<MeldConfig>> {
    const tsDomain = id.toDomain();
    // Use m-ld write locking to guard against API race conditions
    await this.domain.write(async state => {
      // Do we already have a clone of this subdomain?
      let sd = this.subdomains[tsDomain];
      if (sd == null) {
        // Genesis if the subdomain is not already in the account
        sd = await this.getSubdomain(id, await this.isGenesis(state, id));
        // Ensure the subdomain is in the domain
        state = await state.write(accountHasSubdomain(id));
      }
      if (this.usingUserKeys) {
        // Ensure that the account is in the subdomain for signing
        const userKey = await user.key(state, keyid);
        await this.writePrincipalToSubdomain(
          sd, user.name, 'Account', userKey!);
      }
    });
    // Return the config required for a new clone, using some of our config
    return Object.assign({
      '@domain': tsDomain, genesis: false // Definitely not genesis
    }, await this.cloneFactory.reusableConfig(this.config));
  }

  async isGenesis(state: MeldReadState, id: AccountOwnedId) {
    return !(await state.ask({ '@where': accountHasSubdomain(id) }));
  }

  async getSubdomain(id: AccountOwnedId, genesis = false) {
    if (this.hasClonedSubdomain(id))
      return this.subdomains[id.toDomain()];
    // If genesis, check that this subdomain has not existed before
    if (genesis && await this.tsTombstoneExists(id))
      throw new ConflictError();
    const sd = await this.cloneSubdomain(id, genesis);
    // Ensure that the clone is online to avoid race with the client
    await sd.clone.status.becomes({ online: true });
    return sd;
  }

  async cloneSubdomain(id: AccountOwnedId, genesis = false): Promise<SubdomainClone> {
    const config = Object.assign(Env.mergeConfig<BaseGatewayConfig>(this.config, {
      '@id': uuid(), '@domain': id.toDomain(), '@context': false
    }), { genesis });
    LOG.info(id, 'ID is', config['@id']);
    const sd = new SubdomainClone(
      ...await this.cloneFactory.clone(config, await this.getDataPath(id), this.me));
    // Attach change listener
    // Note we have not waited for up to date, so this picks up rev-ups
    sd.clone.follow((update, state) => this.onUpdateSubdomain(id, update, state));
    if (genesis && this.usingUserKeys) {
      // Add our machine identity and key to the subdomain for signing
      await this.writePrincipalToSubdomain(sd, '/', 'Gateway', this.me.userKey!);
    }
    return this.subdomains[id.toDomain()] = sd;
  }

  hasClonedSubdomain(id: AccountOwnedId) {
    return id.toDomain() in this.subdomains;
  }

  close() {
    this.subs.unsubscribe();
    // Close the gateway domain
    return Promise.all([
      this.domain?.close(),
      ...Object.values(this.subdomains).map(d => d.close())
    ]);
  }
}

