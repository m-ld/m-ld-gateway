import { AccountOwnedId } from '../lib/index';
import { Optional, propertyValue, Subject } from '@m-ld/m-ld';

export interface SubdomainSpec {
  readonly account: string;
  readonly name: string;
  readonly useSignatures?: boolean
}

/**
 * Details of a subdomain registered in the Gateway domain
 */
export class Subdomain implements SubdomainSpec {
  static fromJSON(src: any) {
    const { account, name } = AccountOwnedId.fromReference(src);
    const useSignatures = propertyValue(src, 'useSignatures', Optional, Boolean);
    return new Subdomain({ account, name, useSignatures });
  }

  readonly account: string;
  readonly name: string;
  readonly useSignatures: boolean;

  constructor(spec: SubdomainSpec) {
    this.account = spec.account;
    this.name = spec.name;
    this.useSignatures = spec.useSignatures ?? false;
  }

  toJSON(): Subject {
    return {
      '@id': new AccountOwnedId(this).toRelativeIri(),
      '@type': 'Subdomain',
      useSignatures: this.useSignatures
    };
  }
}