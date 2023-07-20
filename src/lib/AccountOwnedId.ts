import { domainRelativeIri } from './util.js';
import { Reference } from '@m-ld/m-ld';
import { as } from '../lib/validate.js';

/**
 * Combination of gateway, account and timesheet/project. Representations:
 * 1. Presentation string `[<account>/]<name>[@<gateway>]`,
 *   see {@link toString} and {@link #fromString}.
 * 2. Configuration/persistence path array
 *   see {@link #toPath} and {@link #fromPath}.
 * 3. m-ld domain name `<name>.<account>.<gateway>`
 *   see {@link #fromDomain}.
 */
export class AccountOwnedId {
  static fromString(str: string) {
    const [accName, gateway] = str.split('@');
    const [account, name] = accName.split('/');
    if (name != null) // account included
      return new AccountOwnedId({ account, name, gateway });
    else // No account included
      return new AccountOwnedId({ name: account, gateway });
  }

  static fromPath(dir: string[]) {
    const [name, account, ...gateway] = [...dir].reverse();
    return new AccountOwnedId({
      account, name, gateway: gateway.join('.')
    });
  }

  static fromDomain(domain: string) {
    return AccountOwnedId.fromPath(domain.split('.').reverse());
  }

  static fromIri(iri: string | URL, gateway?: string) {
    if (typeof iri == 'string') {
      if (!gateway && !iri.includes('//')) {
        const [account, name] = iri.split('/');
        return new AccountOwnedId({ account, name });
      }
      iri = new URL(gateway == null ? iri : domainRelativeIri(iri, gateway));
    }
    gateway = iri.hostname;
    const [, account, name] = iri.pathname.split('/');
    return new AccountOwnedId({ gateway, account, name });
  }

  static fromReference(ref: Reference, gateway?: string) {
    return this.fromIri(ref['@id'], gateway);
  }

  public readonly gateway: string;
  public readonly account: string;
  public readonly name: string;

  /**
   * @param name
   * @param account
   * @param gateway dot-separated gateway "domain name"
   */
  constructor({ gateway, account, name }: { gateway?: string, account?: string, name: string }) {
    this.gateway = gateway ?? '';
    this.account = account ?? '';
    this.name = name;
  }

  get isRelative() {
    return !this.gateway;
  }

  get isValid() {
    return (this.isRelative ||
        this.gateway.split('.').every(AccountOwnedId.isComponentId))
      && AccountOwnedId.isComponentId(this.account)
      && AccountOwnedId.isComponentId(this.name);
  }

  /** Validates this ID */
  validate() {
    // Gateway is allowed to be undefined or false
    if (!this.isRelative)
      this.gateway.split('.').forEach(AccountOwnedId.checkComponentId);
    AccountOwnedId.checkComponentId(this.account);
    AccountOwnedId.checkComponentId(this.name);
    return this;
  }

  static checkComponentId(id: string) {
    as.assert(id, AccountOwnedId.asComponentId);
  }

  static isComponentId(id: string) {
    return !AccountOwnedId.asComponentId.validate(id).error;
  }

  static asComponentId = as.string().regex(/^[a-z0-9_-]+$/).required();

  /**
   * @returns {string[]} relative directory path suitable for persistence
   */
  toPath() {
    return [
      ...this.gateway.split('.').reverse(),
      this.account,
      this.name
    ];
  }

  toDomain() {
    return `${this.name}.${this.account}.${this.gateway}`;
  }

  toIri() {
    const path = this.toRelativeIri();
    return this.isRelative ? path : domainRelativeIri(path, this.gateway);
  }

  toRelativeIri() {
    return `${this.account}/${this.name}`;
  }

  toReference() {
    return { '@id': this.toIri() };
  }

  toStateId(tick: number) {
    return `${this.toIri()}?tick=${tick}`;
  }

  toString() {
    let rtn = this.account ? `${this.account}/` : '';
    rtn += this.name;
    rtn += this.gateway ? `@${this.gateway}` : '';
    return rtn;
  }

  toJSON() {
    const { gateway, account, name } = this;
    return { gateway, account, name };
  }
}