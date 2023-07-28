import { AuthKey, KeyStore } from './AuthKey.js';
import { randomBytes } from 'crypto';

/**
 * A key store that persists to a m-ld domain
 */
export class DomainKeyStore implements KeyStore {
  constructor(
    private readonly appId: string
  ) {}

  async mintKey(name: string) {
    const material = randomBytes(40).toString('hex')
      .replace(/\d/g, c =>
        String.fromCharCode('g'.charCodeAt(0) + Number(c)));
    return {
      key: new AuthKey({
        appId: this.appId,
        keyid: material.slice(0, 6),
        secret: material.slice(6)
      }),
      name,
      revoked: false
    };
  }

  async pingKey(keyid: string) {
    return undefined; // No key stored
  }
}
