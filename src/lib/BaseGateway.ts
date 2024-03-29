import { AccountOwnedId } from './AccountOwnedId.js';
import { domainRelativeIri } from './util.js';
import { MeldConfig, Reference } from '@m-ld/m-ld';
import * as dns from 'dns/promises';
import { AuthKeyConfig } from './AuthKey.js';
import { isFQDN } from './validate.js';

/**
 * The basic config used by both clients (using this lib) and servers
 */
export interface BaseGatewayConfig extends MeldConfig, AuthKeyConfig {
  /**
   * Public Gateway address, may be a domain name or a URL
   * @see resolveGateway
   */
  gateway: string | URL;
  /** The user; undefined if this is a service */
  user?: string;
  /** Allow any other keys for config */
  [key: string]: any;
}

/**
 * Utility base class for things that represent a Gateway, may be a client proxy
 */
export class BaseGateway {
  constructor(
    public readonly domainName: string
  ) {}

  ownedRefAsId(tsRef: Reference) {
    // A subdomain reference may be relative to the domain base
    return AccountOwnedId.fromReference(tsRef, this.domainName);
  }

  ownedId({ account, name }: { account: string, name: string }) {
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
  address: string | URL
): URL | Promise<URL> {
  if (address instanceof URL) {
    return address;
  } else if (isFQDN(address)) {
    return new URL(`https://${address}/`);
  } else {
    const url = new URL('/', address);
    const domainName = url.hostname;
    if (domainName.endsWith('.local')) {
      return dns.lookup(domainName).then(a => {
        url.hostname = a.address;
        return url;
      });
    } else {
      return url;
    }
  }
}

export function resolveDomain(gateway: BaseGatewayConfig['gateway']) {
  return typeof gateway == 'string' && isFQDN(gateway) ?
    gateway : new URL(gateway).hostname;
}