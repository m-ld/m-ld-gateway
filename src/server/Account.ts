import { GraphSubject, MeldReadState, propertyValue, Query, Read, Reference } from '@m-ld/m-ld';
import { AccountOwnedId, AuthKey, idSet, Results } from '../lib/index.js';
import { UserKey } from '../data/index.js';
import {
  BadRequestError, ForbiddenError, InternalServerError, toHttpError, UnauthorizedError
} from '../http/errors.js';
import { Gateway } from './Gateway.js';
import { AccessRequest } from './Authorization.js';
import { userIsAdmin } from './statements.js';

/**
 * Javascript representation of an Account subject in the Gateway domain.
 * Instances are ephemeral, instantiated dynamically on demand.
 */
export class Account {
  static fromJSON(gateway: Gateway, src: GraphSubject) {
    // noinspection JSCheckFunctionSignatures
    return new Account(gateway, {
      name: src['@id'],
      emails: propertyValue(src, 'email', Set, String),
      keyids: propertyValue(src, 'key', Array, Reference).map(UserKey.keyidFromRef),
      admins: idSet(propertyValue(src, 'vf:primaryAccountable', Array, Reference)),
      subdomains: propertyValue(src, 'subdomain', Array, Reference)
    });
  }

  /** plain account name */
  readonly name: string;
  /** verifiable account identities */
  private readonly emails: Set<string>;
  /** per-device keys */
  private readonly keyids: Set<string>;
  /** admin (primary accountable) IRIs */
  private readonly admins: Set<string>;
  /** directly-owned entity IRIs */
  private readonly subdomains: Reference[];
  /**
   * Cache of owned entities, including indirectly via org account
   * @see loadAllOwned
   */
  private readonly allOwned: { [type: string]: Set<string> };

  constructor(private readonly gateway: Gateway, {
    name,
    emails = [],
    keyids = [],
    admins = [],
    subdomains = []
  }: {
    name: string,
    emails?: Iterable<string>,
    keyids?: Iterable<string>,
    admins?: Iterable<string>,
    subdomains?: Reference[]
  }) {
    this.gateway = gateway;
    this.name = name;
    this.emails = new Set([...emails ?? []]);
    this.keyids = new Set([...keyids ?? []]);
    this.admins = new Set([...admins ?? []]);
    this.subdomains = subdomains ?? [];
    this.allOwned = {}; // See allOwned
  }

  // TODO: User registration

  /**
   * TODO: Refactor awkward return type
   * @returns the user key, if the gateway is using user keys
   * @throws UnauthorizedError if the key does not belong to this account or is
   * revoked
   */
  async authorise(keyid: string, access?: AccessRequest): Promise<UserKey | AuthKey> {
    return new Promise(async (resolve, reject) => {
      this.gateway.domain.read(async state => {
        try {
          const userKey = await this.key(state, keyid);
          if (userKey?.revoked)
            return reject(new UnauthorizedError('Key revoked'));
          // noinspection JSIncompatibleTypesComparison
          if (access != null)
            await this.checkAccess(state, access);
          try {
            if (this.name === this.gateway.rootAccountName) {
              // Special case: do not ping the key if it's the root
              const principal = this.gateway.me;
              resolve(principal.userKey ?? principal.authKey);
            } else {
              const keyDetail = await this.gateway.keyStore.pingKey(
                keyid, () => this.allSubdomainIds(state));
              if (keyDetail == null && userKey == null)
                return reject(new InternalServerError(
                  `Configuration error: key ${keyid} not available`));
              if (keyDetail?.revoked)
                // TODO: If keystore says revoked, update the userKey
                return reject(new UnauthorizedError('Key revoked'));
              return resolve(keyDetail?.key ?? userKey!);
            }
          } catch (e) {
            // TODO: Assuming this is a Not Found
            return reject(new UnauthorizedError(e));
          }
        } catch (e) {
          return reject(toHttpError(e));
        }
      });
    });
  }

  async checkAccess(state: MeldReadState, access: AccessRequest) {
    const iri = access.id.toRelativeIri();
    const writable: { [key: string]: Set<string> } = {};
    if (access.forWrite && !this.ownedTypes.includes(access.forWrite))
      throw new BadRequestError(`Not a recognised type: ${access.forWrite}`);
    for (let ownedType of this.ownedTypes)
      writable[ownedType] = await this.loadAllOwned(state, ownedType);
    if (access.forWrite && !(await state.ask({ '@where': { '@id': iri } }))) {
      // Creating; check write access to account
      if (access.id.account !== this.name &&
        !(await state.ask({ '@where': userIsAdmin(this.name, access.id.account) })))
        throw new ForbiddenError();
      // Otherwise OK to create
      writable[access.forWrite].add(iri);
    } else if (!Object.values(writable).some(owned => owned.has(iri))) {
      if (access.forWrite) {
        throw new ForbiddenError();
      } else {
        return this.checkReadAccess(state, iri, writable);
      }
    }
  }

  // TODO: Override in timeld
  async checkReadAccess(
    _state: MeldReadState,
    _iri: string,
    _writable: { [key: string]: Set<string> }
  ): Promise<unknown> {
    throw new ForbiddenError();
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
   * corresponding user key, if cryptographic keys are being used.
   * @throws UnauthorizedError if the key does not belong to this account
   */
  async key(state: MeldReadState, keyid: string): Promise<UserKey | undefined> {
    if (!this.keyids.has(keyid))
      throw new UnauthorizedError(
        `Key ${keyid} does not belong to account ${this.name}`);
    if (this.gateway.usingUserKeys) {
      const src = await state.get(UserKey.refFromKeyid(keyid)['@id']);
      if (src != null)
        return UserKey.fromJSON(src);
      else
        throw new InternalServerError('User key not found');
    }
  }

  /**
   * @param {MeldReadState} state
   * @returns {Promise<AccountOwnedId[]>}
   */
  async allSubdomainIds(state: MeldReadState) {
    return [...await this.loadAllOwned(state, 'Subdomain')]
      .map(iri => AccountOwnedId.fromIri(iri, this.gateway.domainName));
  }

  async read(query: Read, tsId?: AccountOwnedId): Promise<Results> {
    return new Promise(async (resolve, reject) => {
      const clone = await this.targetClone(tsId);
      clone.read(async state => {
        try {
          // noinspection JSCheckFunctionSignatures
          resolve(state.read(query).consume);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async write(query: Query, tsId?: AccountOwnedId) {
    // Only the gateway account is able to write to the gateway domain
    if (tsId == null && this.name !== this.gateway.rootAccountName)
      throw new UnauthorizedError();
    // TODO: Other authorisations
    const clone = await this.targetClone(tsId);
    await clone.write(query);
  }

  private async targetClone(tsId: AccountOwnedId | undefined) {
    return tsId != null ?
      await this.gateway.initSubdomain(tsId, false) :
      this.gateway.domain;
  }

  toJSON() {
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