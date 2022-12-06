import { AuthKey, AuthKeyStore } from './AuthKey';
import { randomBytes } from 'crypto';
import { MeldConfig, shortId } from '@m-ld/m-ld';

/**
 * A key store that persists to a m-ld domain
 */
export default class DomainKeyStore implements AuthKeyStore {
  private readonly appId: string;

  constructor(config: MeldConfig) {
    this.appId = shortId(config['@domain']);
  }

  async mintKey(name: string) {
    const material = randomBytes(40).toString('base64');
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
    return false; // No revocation status stored, assume not revoked
  }
}
