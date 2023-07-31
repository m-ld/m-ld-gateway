import LRUCache from 'lru-cache';
import { SubdomainClone } from './SubdomainClone';
import LOG from 'loglevel';
import { GatewayConfig } from './index';

/**
 * All mutating access to the cache should be serialised with m-ld states
 */
export class SubdomainCache extends LRUCache<string, SubdomainClone> {
  constructor(config: GatewayConfig) {
    super({
      max: config.subdomainCacheSize ?? 100,
      dispose(_name: string, sdc: SubdomainClone) {
        sdc.close().catch(err => LOG.warn(err));
      },
    });
  }

  async clear() {
    await Promise.all(this.values().map(sdc => sdc.close()));
    super.reset();
  }
}