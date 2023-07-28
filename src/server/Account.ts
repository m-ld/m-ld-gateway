import {
  GraphSubject, MeldClone, MeldReadState, propertyValue, Reference, Subject, Update
} from '@m-ld/m-ld';
import { AccountOwnedId, as, GatewayPrincipal, idSet, KeyStore, validate } from '../lib/index.js';
import { UserKey } from '../data/index.js';
import {
  BadRequestError, ForbiddenError, InternalServerError, UnauthorizedError
} from '../http/errors.js';
import { AccessRequest } from './Authorization.js';
import { userIsAdmin } from './statements.js';

/** Abstract account */
type AccountSpec = {
  name: string,
  emails?: Iterable<string>,
  keyids?: Iterable<string>,
  admins?: Iterable<string>,
  subdomains?: Reference[]
};

export interface AccountContext {
  readonly me: GatewayPrincipal;
  readonly domain: MeldClone;
  readonly domainName: string;
  readonly keyStore: KeyStore;
  readonly rootAccountName: string;
}

export type SubdomainNaming = 'any' | 'uuid';
export type RemotesAuthType = 'anon' | 'key' | 'jwt';

export interface AccountDetails {
  emails: string[],
  naming: SubdomainNaming[],
  remotesAuth: RemotesAuthType[]
}

const asAccountUpdate = as.object({
  email: as.string().email(),
  naming: as.valid('any', 'uuid'),
  remotesAuth: as.valid('anon', 'key', 'jwt')
}).or('email', 'naming', 'remotesAuth');

/**
 * Javascript representation of an Account subject in the Gateway domain.
 * Instances are ephemeral, instantiated dynamically on demand.
 */
export class Account {
  static fromJSON(gateway: AccountContext, src: GraphSubject) {
    // noinspection JSCheckFunctionSignatures
    return new Account(gateway, {
      name: src['@id'],
      emails: propertyValue(src, 'email', Set, String),
      keyids: propertyValue(src, 'key', Array, Reference).map(UserKey.keyidFromRef),
      admins: idSet(propertyValue(src, 'vf:primaryAccountable', Array, Reference)),
      subdomains: propertyValue(src, 'subdomain', Array, Reference)
    });
  }

  static async getDetails<K extends keyof AccountDetails>(
    state: MeldReadState,
    account: string,
    detail: K
  ): Promise<AccountDetails[K]> {
    const acc = await state.get(account, detail);
    return acc != null ? <AccountDetails[K]>propertyValue(acc, detail, Array, String) : [];
  }

  /** plain account name */
  readonly name: string;
  /** verifiable account identities */
  readonly emails: Set<string>;
  /** per-device keys */
  readonly keyids: Set<string>;
  /** admin (primary accountable) IRIs */
  readonly admins: Set<string>;
  /** directly-owned subdomain IRIs */
  readonly subdomains: Reference[];
  /**
   * Cache of owned entities, including indirectly via org account
   * @see loadAllOwned
   */
  private readonly allOwned: { [type: string]: Set<string> };

  constructor(
    private readonly gateway: AccountContext,
    {
      name,
      emails = [],
      keyids = [],
      admins = [],
      subdomains = []
    }: AccountSpec
  ) {
    this.gateway = gateway;
    this.name = name;
    this.emails = new Set([...emails ?? []]);
    this.keyids = new Set([...keyids ?? []]);
    this.admins = new Set([...admins ?? []]);
    this.subdomains = subdomains ?? [];
    this.allOwned = {}; // See allOwned
  }

  update(patch: Update) {
    const asMyUpdate = asAccountUpdate.append({
      '@id': as.equal(this.name).default(this.name)
    });
    const update = validate(patch, as.object({
      '@delete': asMyUpdate,
      '@insert': asMyUpdate
    }).or('@delete', '@insert'));
    return this.gateway.domain.write(update);
  }

  /**
   * Activation of a gateway account with a user email.
   * @returns key config for the account
   */
  async generateKey(opts: { email?: string, type?: 'rsa' }) {
    // Every activation creates a new key (assumes new device)
    const keyDetails = await this.gateway.keyStore
      .mintKey(`${this.name}@${this.gateway.domainName}`);
    // Generate a key pair for signing
    const userKey = UserKey.generate(keyDetails.key);
    const key = userKey.toJSON();
    const config = opts.type != null ?
      userKey.toConfig(keyDetails.key) :
      keyDetails.key.toConfig();
    // Store the keyid and the email
    this.keyids.add(keyDetails.key.keyid);
    if (opts.email)
      this.emails.add(opts.email);
    // Patch the changed details, including the new key
    await this.gateway.domain.write({
      '@id': this.name, key, email: opts.email
    });
    return config;
  }

  /**
   * TODO: Refactor awkward return type
   * @returns the user key, if the gateway is using user keys
   * @throws UnauthorizedError if the key does not belong to this account or is
   * revoked
   */
  async authorise(keyid: string, access?: AccessRequest): Promise<UserKey> {
    return new Promise(async (resolve, reject) => {
      this.gateway.domain.read(async state => {
        try {
          const userKey = await this.key(state, keyid);
          if (userKey.revoked)
            return reject(new UnauthorizedError('Key revoked'));
          if (access != null && !await this.hasAccess(state, access))
            return reject(new ForbiddenError);
          // Special case: do not ping the key if it's the root
          if (this.name === this.gateway.rootAccountName)
            return resolve(this.gateway.me.userKey);
          const keyDetail = await this.gateway.keyStore.pingKey(
            keyid, () => this.allSubdomainIds(state));
          if (keyDetail?.revoked)
            // TODO: If keystore says revoked, update the userKey
            return reject(new UnauthorizedError('Key revoked'));
          return resolve(userKey);
        } catch (e) {
          // TODO: Assuming this is a Not Found
          return reject(new UnauthorizedError(e));
        }
      });
    });
  }

  async hasAccess(state: MeldReadState, access: AccessRequest): Promise<boolean> {
    const iri = access.id.toRelativeIri();
    const writable: { [key: string]: Set<string> } = {};
    if (access.forWrite && !this.ownedTypes.includes(access.forWrite))
      throw new BadRequestError(`Not a recognised type: ${access.forWrite}`);
    for (let ownedType of this.ownedTypes)
      writable[ownedType] = await this.loadAllOwned(state, ownedType);
    if (access.forWrite && !(await state.ask({ '@where': { '@id': iri } }))) {
      // Creating; check write access to account
      if (!await this.hasWriteAccess(state, access.id.account))
        return false;
      // Otherwise OK to create
      writable[access.forWrite].add(iri);
      return true;
    } else if (!Object.values(writable).some(owned => owned.has(iri))) {
      return access.forWrite ? false : this.hasReadAccess(state, iri, writable);
    } else {
      return true;
    }
  }

  protected async hasWriteAccess(state: MeldReadState, toAccount: string) {
    return toAccount === this.name ||
      state.ask({ '@where': userIsAdmin(this.name, toAccount) });
  }

  // TODO: Override in timeld
  protected async hasReadAccess(
    _state: MeldReadState,
    _iri: string,
    _writable: { [key: string]: Set<string> }
  ): Promise<boolean> {
    return false;
  }

  /**
   * Override to support additional owned subject types. Each type must be used
   * as follows:
   * 1. As the `@type` of each owned subject
   * 2. Lower-cased, as a multi-valued property (from the gateway vocabulary) of
   * each Account
   * TODO: Override in timeld
   */
  get ownedTypes() {
    return ['Subdomain'];
  }

  async loadAllOwned(state: MeldReadState, type: string): Promise<Set<string>> {
    if (this.allOwned[type] == null) {
      this.allOwned[type] = type === 'Subdomain' ?
        idSet(this.subdomains) : new Set<string>;
      await state.read({
        '@select': '?owned',
        '@where': ({
          '@type': 'Account',
          'vf:primaryAccountable': { '@id': this.name },
          [type.toLowerCase()]: '?owned'
        })
      }).forEach(result => this.allOwned[type].add((<Reference>result['?owned'])['@id']));
    }
    return this.allOwned[type];
  }

  /**
   * Checks that the given keyid belongs to this account and returns the
   * corresponding user key
   * @throws UnauthorizedError if the key does not belong to this account
   */
  async key(state: MeldReadState, keyid: string): Promise<UserKey> {
    if (!this.keyids.has(keyid))
      throw new UnauthorizedError(
        `Key ${keyid} does not belong to account ${this.name}`);
    if (this.name === this.gateway.rootAccountName)
      return this.gateway.me.userKey;
    const src = await state.get(UserKey.refFromKeyid(keyid)['@id']);
    if (src != null)
      return UserKey.fromJSON(src);
    else
      throw new InternalServerError('User key not found');
  }

  /**
   * @param {MeldReadState} state
   * @returns {Promise<AccountOwnedId[]>}
   */
  async allSubdomainIds(state: MeldReadState) {
    return [...await this.loadAllOwned(state, 'Subdomain')]
      .map(iri => AccountOwnedId.fromIri(iri, this.gateway.domainName));
  }

  toJSON(): Subject {
    return {
      '@id': this.name, // scoped to gateway domain
      '@type': 'Account',
      'email': [...this.emails],
      'key': [...this.keyids].map(keyid => UserKey.refFromKeyid(keyid)),
      'vf:primaryAccountable': [...this.admins].map(iri => ({ '@id': iri })),
      'subdomain': this.subdomains
    };
  }
}
