import { AccountOwnedId } from './AccountOwnedId';
import { domainRelativeIri } from './util';
import { MeldConfig, Reference } from '@m-ld/m-ld';
import isFQDN from 'validator/lib/isFQDN';
import * as dns from 'dns/promises';
import { AuthKeyConfig } from './AuthKey';

/**
 * The basic config used by both CLI and gateway
 */
export interface BaseGatewayConfig extends MeldConfig, AuthKeyConfig {
  /**
   * Gateway identifier, may be a domain name or a URL
   * @see resolveGateway
   */
  gateway: string | URL | false;
  user?: string;
}


/**
 * Utility base class for things that represent a Gateway, may be a client proxy
 */
export class BaseGateway {
  constructor(
    public readonly domainName: string
  ) {
    if (!domainName)
      throw new RangeError('No domain specified for Gateway');
  }

  ownedRefAsId(tsRef: Reference) {
    // A timesheet reference may be relative to the domain base
    return AccountOwnedId.fromReference(tsRef, this.domainName);
  }

  ownedId(account: string, name: string) {
    return new AccountOwnedId({
      gateway: this.domainName, account, name
    });
  }

  absoluteId(iri: string) {
    return domainRelativeIri(iri, this.domainName);
  }
}

/**
 *
 */
export function resolveGateway(
  address: string
): { root: URL | Promise<URL>, domainName: string } {
  if (isFQDN(address)) {
    return { root: new URL(`https://${address}/`), domainName: address };
  } else {
    const url = new URL('/', address);
    const domainName = url.hostname;
    if (domainName.endsWith('.local')) {
      return {
        root: dns.lookup(domainName).then(a => {
          url.hostname = a.address;
          return url;
        }),
        domainName
      };
    } else {
      return { root: url, domainName };
    }
  }
}