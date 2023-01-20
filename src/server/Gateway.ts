import {
  GraphSubject, MeldClone, MeldConfig, MeldReadState, MeldUpdate, propertyValue, Reference, uuid
} from '@m-ld/m-ld';
import {
  AccountOwnedId, AuthKeyStore, BaseGateway, BaseGatewayConfig, CloneFactory, Env, GatewayPrincipal,
  Results
} from '../lib/index.js';
import { gatewayContext, Iri, UserKey } from '../data/index.js';
import LOG from 'loglevel';
import { access, rm, writeFile } from 'fs/promises';
import { finalize, Subscription } from 'rxjs';
import { ConflictError } from '../http/errors.js';
import { GatewayConfig } from './index.js';
import { Bite } from 'rx-flowable';
import { Account } from './Account.js';
import { accountHasSubdomain } from './statements.js';

export class Gateway extends BaseGateway {
  public readonly me: GatewayPrincipal;
  public /*readonly*/ domain: MeldClone;

  private readonly config: GatewayConfig;
  private readonly subdomains: { [name: string]: MeldClone } = {};
  private readonly subs: Subscription = new Subscription();

  constructor(
    private readonly env: Env,
    config: Partial<GatewayConfig>,
    private readonly cloneFactory: CloneFactory,
    public readonly keyStore: AuthKeyStore
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
      }).toJSON());
    // Enliven all subdomains and connectors already in the domain
    await new Promise(resolve => {
      this.subs.add(this.domain.read(state =>
          this.initDomain(state).then(resolve),
        (update, state) => this.onUpdateDomain(update, state)
      ));
    });
    return this;
  }

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
  readAsync(results: Results, sub: (value: Bite<GraphSubject>) => void) {
    return new Promise<void>(resolve => {
      // noinspection JSCheckFunctionSignatures
      this.subs.add(results.pipe(finalize(resolve)).subscribe(sub));
    });
  }

  async cloneSubdomain(tsId: AccountOwnedId, genesis = false): Promise<MeldClone> {
    const config = Object.assign(Env.mergeConfig<BaseGatewayConfig>(this.config, {
      '@id': uuid(), '@domain': tsId.toDomain(), '@context': false
    }), { genesis });
    LOG.info(tsId, 'ID is', config['@id']);
    const [ts] = await this.cloneFactory.clone(config, await this.getDataPath(tsId), this.me);
    // Attach change listener
    // Note we have not waited for up to date, so this picks up rev-ups
    ts.follow((update, state) => this.onUpdateSubdomain(tsId, update, state));
    if (genesis && this.usingUserKeys) {
      // Add our machine identity and key to the subdomain for signing
      await this.writePrincipalToSubdomain(ts, '/', 'Gateway', this.me.userKey!);
    }
    return this.subdomains[tsId.toDomain()] = ts;
  }

  // TODO: implement this in timeld
  onUpdateSubdomain(
    _tsId: AccountOwnedId,
    _update: MeldUpdate,
    _state: MeldReadState
  ): Promise<unknown> {
    return Promise.resolve();
  }

  /**
   * @param ts
   * @param iri gateway-relative or absolute IRI
   * @param type note vocabulary is common between gw and ts
   * @param key
   */
  async writePrincipalToSubdomain(
    ts: MeldClone,
    iri: Iri,
    type: 'Account' | 'Gateway',
    key: UserKey
  ) {
    await ts.write({
      '@id': this.absoluteId(iri),
      '@type': type,
      key: key.toJSON(true)
    });
  }

  getDataPath(tsId: AccountOwnedId) {
    return this.env.readyPath('data', 'domain', tsId.account, tsId.name);
  }

  async subdomainAdded(tsId: AccountOwnedId) {
    if (!(tsId.toDomain() in this.subdomains)) {
      try {
        await this.cloneSubdomain(tsId);
        LOG.info('Loaded declared subdomain', tsId);
      } catch (e) {
        // If the clone fails that's fine, we'll try again if it's asked for
        LOG.warn('Failed to load declared subdomain', tsId, e);
      }
    }
  }

  async subdomainRemoved(tsId: AccountOwnedId) {
    try {
      await this.subdomains[tsId.toDomain()]?.close();
      const path = await this.getDataPath(tsId);
      // Remove the persistent data
      await rm(path, { recursive: true, force: true });
      // Write the tombstone file to prevent re-creation
      await writeFile(`${path}.rip`, '');
      // TODO: Remove all channel permissions
      delete this.subdomains[tsId.toDomain()];
      LOG.info('Removed declared subdomain', tsId);
    } catch (e) {
      LOG.warn('Error removing declared subdomain', tsId, e);
    }
  }

  async tsTombstoneExists(tsId: AccountOwnedId) {
    const path = await this.getDataPath(tsId);
    return access(`${path}.rip`).then(() => true, () => false);
  }

  /**
   * @param account name
   * @param [orCreate] allow creation of new account
   */
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
   * Gets the m-ld configuration for a subdomain. Calling this method will
   * create the subdomain if it does not already exist.
   *
   * The caller must have already checked user access to the subdomain.
   */
  async subdomainConfig(
    tsId: AccountOwnedId,
    { acc: user, keyid }: { acc: Account, keyid: string }
  ): Promise<Partial<MeldConfig>> {
    const tsDomain = tsId.toDomain();
    // Use m-ld write locking to guard against API race conditions
    await this.domain.write(async state => {
      // Do we already have a clone of this subdomain?
      let ts = this.subdomains[tsDomain];
      if (ts == null) {
        // Genesis if the subdomain is not already in the account
        ts = await this.initSubdomain(tsId, await this.isGenesisTs(state, tsId));
        // Ensure the subdomain is in the domain
        state = await state.write(accountHasSubdomain(tsId));
      }
      if (this.usingUserKeys) {
        // Ensure that the account is in the subdomain for signing
        const userKey = await user.key(state, keyid);
        await this.writePrincipalToSubdomain(
          ts, user.name, 'Account', userKey!);
      }
    });
    // Return the config required for a new clone, using some of our config
    return Object.assign({
      '@domain': tsDomain, genesis: false // Definitely not genesis
    }, this.cloneFactory.reusableConfig(this.config));
  }

  async isGenesisTs(state: MeldReadState, tsId: AccountOwnedId) {
    return !(await state.ask({ '@where': accountHasSubdomain(tsId) }));
  }

  async initSubdomain(tsId: AccountOwnedId, genesis: boolean) {
    if (this.hasClonedSubdomain(tsId))
      return this.subdomains[tsId.toDomain()];
    // If genesis, check that this subdomain has not existed before
    if (genesis && await this.tsTombstoneExists(tsId))
      throw new ConflictError();
    const ts = await this.cloneSubdomain(tsId, genesis);
    // Ensure that the clone is online to avoid race with the client
    await ts.status.becomes({ online: true });
    return ts;
  }

  hasClonedSubdomain(tsId: AccountOwnedId) {
    return tsId.toDomain() in this.subdomains;
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

