import {
  MeldClone, MeldConfig, MeldReadState, MeldUpdate, propertyValue, Reference, uuid
} from '@m-ld/m-ld';
import {
  AccountOwnedId, asUuid, BaseGateway, BaseGatewayConfig, CloneFactory, Env, GatewayPrincipal,
  KeyStore, matches
} from '../lib/index.js';
import { gatewayContext, Iri, UserKey } from '../data/index.js';
import LOG from 'loglevel';
import { access, rm, writeFile } from 'fs/promises';
import { Subscription } from 'rxjs';
import {
  BadRequestError, ConflictError, NotFoundError, UnauthorizedError
} from '../http/errors.js';
import { GatewayConfig } from './index.js';
import { Account, AccountContext } from './Account.js';
import { SubdomainClone } from './SubdomainClone.js';
import { randomInt } from 'crypto';
import jsonwebtoken, { JwtPayload } from 'jsonwebtoken';
import Cryptr from 'cryptr';
import { Subdomain, SubdomainSpec } from '../data/Subdomain.js';
import { SubdomainCache } from './SubdomainCache';

export interface Who {
  acc: Account,
  keyid: string
}

export class Gateway extends BaseGateway implements AccountContext {
  public readonly me: GatewayPrincipal;
  public /*readonly*/ domain: MeldClone;
  public readonly config: GatewayConfig;

  private readonly subs: Subscription = new Subscription();

  // noinspection JSUnusedGlobalSymbols keyStore is in account context
  constructor(
    private readonly env: Env,
    config: GatewayConfig,
    private readonly cloneFactory: CloneFactory,
    readonly keyStore: KeyStore,
    private readonly subdomainCache: SubdomainCache
  ) {
    super(config['@domain']!);
    LOG.debug('Gateway domain is', this.domainName);
    this.config = { ...config, '@context': gatewayContext };
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
    this.subs.add(this.domain.follow(update =>
      this.onUpdateSubdomains(update).then()));
    return this;
  }

  get rootAccountName() {
    return this.me.authKey.appId.toLowerCase();
  }

  onUpdateSubdomains(update: MeldUpdate) {
    // Watch for subdomains appearing and disappearing
    // noinspection JSCheckFunctionSignatures
    return Promise.all(
      update['@delete'].map(subject => Promise.all(
        propertyValue(subject, 'subdomain', Array, Reference).map(tsRef =>
          this.subdomainRemoved(this.ownedRefAsId(tsRef)))))
    );
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

  async subdomainRemoved(id: AccountOwnedId) {
    try {
      // Not relying on cache dispose, we want to wait for the close
      await this.subdomainCache.peek(id.toDomain())?.close();
      const path = await this.getDataPath(id);
      // Remove the persistent data
      await rm(path, { recursive: true, force: true });
      // Write the tombstone file to prevent re-creation
      await writeFile(`${path}.rip`, '');
      // TODO: Remove all channel permissions
      this.subdomainCache.del(id.toDomain());
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
  async account(account: string, orCreate?: boolean): Promise<Account | undefined>;
  async account(account: string, orCreate: boolean = false) {
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
  verifyActivation(code: string, jwe: string): { user: string, email: string } {
    const jwt = new Cryptr(code).decrypt(jwe);
    const { sub, email } =
      jsonwebtoken.verify(jwt, this.me.authKey.secret) as JwtPayload;
    if (!AccountOwnedId.isComponentId(sub))
      throw new BadRequestError;
    return { user: sub, email };
  }

  /**
   * Ensures that the named subdomain exists and is backed-up locally.
   *
   * The caller must have already checked user access to the subdomain.
   *
   * @param spec the subdomain specification
   * @param who the user who is asking
   * @return MeldConfig the m-ld configuration for the subdomain
   */
  async ensureNamedSubdomain(spec: SubdomainSpec, who: Who): Promise<Partial<MeldConfig>> {
    const id = this.ownedId(spec);
    // Use m-ld write locking to guard against API race conditions
    await this.domain.write(async state => {
      // Does this subdomain already exist in its account?
      const src = await state.get(id.toRelativeIri()); // Genesis if null
      let sdClone = this.subdomainCache.get(id.toDomain());
      if (sdClone == null) {
        // Check that this subdomain has not existed before
        if (src == null && await this.tsTombstoneExists(id))
          throw new ConflictError('Cannot re-use domain name');
        sdClone = await this.cloneSubdomain(spec, src == null);
        // Ensure that the clone is online to avoid race with the client
        await sdClone.clone.status.becomes({ online: true });
        // Ensure the subdomain is in the domain
        state = await state.write({
          '@id': id.account, subdomain: sdClone.toJSON()
        });
        if (sdClone.useSignatures && who != null) {
          // Ensure that the user account is in the subdomain for signing
          const userKey = await who.acc.key(state, who.keyid);
          await this.writePrincipalToSubdomain(
            sdClone, who.acc.name, 'Account', userKey);
        }
        this.subdomainCache.set(id.toDomain(), sdClone);
      } else if (src != null &&
        spec.useSignatures != null &&
        Subdomain.fromJSON(src).useSignatures !== spec.useSignatures) {
        throw new ConflictError('Cannot change use of signatures after creation');
      }
    });
    return this.getSubdomainConfig(id, false, who);
  }

  /**
   * @param id the subdomain identity
   * @param who the user who is asking
   * @param genesis whether the domain is genesis, if known
   * @returns config required for a new clone, using some of our config
   */
  getSubdomainConfig(
    id: AccountOwnedId,
    genesis?: boolean,
    who?: Who
  ): Promise<Partial<MeldConfig>> {
    return new Promise((resolve, reject) => {
      this.domain.read(async state => {
        try {
          const remotesAuth =
            await Account.getDetails(state, id.account, 'remotesAuth');
          if (genesis == null) {
            if (await state.ask({ '@where': { '@id': id.toRelativeIri() } })) {
              genesis = false; // We have a backup
            } else if (!matches(id.name, asUuid) ||
              !await Account.allowsUuidSubdomains(state, id.account)) {
              return reject(new NotFoundError); // UUID domains not allowed
            } // Otherwise, don't know
          }
          resolve({
            '@domain': id.toDomain(), genesis,
            ...await this.cloneFactory.reusableConfig(this.config, remotesAuth, who)
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  getSubdomain(id: AccountOwnedId): Promise<SubdomainClone | undefined> {
    return new Promise((resolve, reject) => {
      // Use a read lock to prevent concurrent cache manipulation
      this.domain.read(async state => {
        try { // First check the cache
          const inCache = this.subdomainCache.get(id.toDomain());
          if (inCache == null) {
            const src = await state.get(id.toRelativeIri());
            if (src != null) {
              LOG.debug('Cloning declared subdomain', id);
              const sdc = await this.cloneSubdomain(Subdomain.fromJSON(src), false);
              this.subdomainCache.set(id.toDomain(), sdc);
              return resolve(sdc);
            }
          }
          return resolve(inCache);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  private async cloneSubdomain(spec: SubdomainSpec, genesis = false): Promise<SubdomainClone> {
    const id = this.ownedId(spec);
    const config = Object.assign(Env.mergeConfig<BaseGatewayConfig>(this.config, {
      '@id': uuid(), '@domain': id.toDomain(), '@context': false
    }), { genesis });
    LOG.info(id, 'ID is', config['@id']);
    const sdc = new SubdomainClone(spec, ...await this.cloneFactory.clone(
      config, await this.getDataPath(id), spec.useSignatures ? this.me : undefined
    ));
    // Attach change listener
    // Note we have not waited for up to date, so this picks up rev-ups
    sdc.clone.follow((update, state) => this.onUpdateSubdomain(id, update, state));
    if (sdc.useSignatures) {
      // Add our machine identity and key to the subdomain for signing
      await this.writePrincipalToSubdomain(sdc, '/', 'Gateway', this.me.userKey);
    }
    // We could put sdc in the cache here, but prefer to leave that to the
    // caller so that cache calls are co-located.
    return sdc;
  }

  /** @internal for tests */
  hasClonedSubdomain(id: AccountOwnedId) {
    return this.subdomainCache.has(id.toDomain());
  }

  async close() {
    this.subs.unsubscribe();
    // Close the gateway domain
    await Promise.all([
      this.domain?.close(),
      this.subdomainCache.clear()
    ]);
  }
}

