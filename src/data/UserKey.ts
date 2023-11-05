import { GraphSubject, Optional, propertyValue, Reference } from '@m-ld/m-ld';
import {
  createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject, PrivateKeyInput,
  PublicKeyInput, RSAKeyPairOptions, sign, verify
} from 'crypto';
import { AuthKey, AuthKeyConfig, domainRelativeIri, Key } from '../lib/index.js';
import { JwtHeader, JwtPayload, Secret, SignOptions } from 'jsonwebtoken';
import { signJwt, verifyJwt } from '@m-ld/io-web-runtime/dist/server/jwt';
import { as } from '../lib/validate.js';

export interface RsaKeyConfig {
  type: 'rsa';
  public: string;
  private?: string;
}

export const asRsaKeyConfig = as.object({
  type: as.equal('rsa').default('rsa'),
  public: as.string().base64().required(),
  private: as.string().base64().optional()
});

export function keyPairFromConfig(config: RsaKeyConfig) {
  return {
    publicKey: Buffer.from(config.public, 'base64'),
    privateKey: config.private ?
      Buffer.from(config.private, 'base64') : undefined
  };
}

export interface UserKeyConfig extends AuthKeyConfig {
  key: RsaKeyConfig;
}

/**
 * User Key details, appears in:
 * 1. Gateway domain, with all details
 * 2. Timesheet domains, without private key (for sig verify)
 * 3. Client configuration, without revocation (assumed true)
 */
export class UserKey implements Key {
  /**
   * From m-ld subject representation
   */
  static fromJSON(src: GraphSubject) {
    // noinspection JSCheckFunctionSignatures
    return new UserKey({
      keyid: this.keyidFromRef(src),
      name: propertyValue(src, 'name', Optional, String),
      publicKey: propertyValue(src, 'public', Uint8Array),
      privateKey: propertyValue(src, 'private', Optional, Uint8Array),
      revoked: propertyValue(src, 'revoked', Optional, Boolean)
    });
  }

  /**
   * From client config – no name or revocation
   */
  static fromConfig(config: UserKeyConfig) {
    return new UserKey({
      keyid: AuthKey.fromString(config.auth.key).keyid,
      ...keyPairFromConfig(config.key)
    });
  }

  /**
   * @throws {TypeError} if the reference is not to a user key
   */
  static keyidFromRef(ref: Reference) {
    // noinspection JSCheckFunctionSignatures
    const id = ref['@id'].includes('//') ?
      new URL(ref['@id']).pathname.slice(1) : ref['@id'];
    if (!/^\.\w{5,}$/.test(id))
      throw new TypeError(`Unexpected user key identity format "${id}"`);
    return id.slice(1);
  }

  /** @returns Reference */
  static refFromKeyid(keyid: string, domain?: string) {
    const id = `.${keyid}`;
    return { '@id': domain ? domainRelativeIri(id, domain) : id };
  }

  static splitSignature(data: Uint8Array): [string | undefined, Uint8Array] {
    const buf = Buffer.from(data);
    const delim = buf.indexOf(':');
    if (delim < 5)
      return [undefined, data];
    return [buf.subarray(0, delim).toString(), buf.subarray(delim + 1)];
  }

  static generate(authKey: AuthKey | string) {
    if (typeof authKey == 'string')
      authKey = AuthKey.fromString(authKey);
    // noinspection JSCheckFunctionSignatures
    return new UserKey({
      keyid: authKey.keyid,
      ...generateKeyPairSync('rsa', <RSAKeyPairOptions<'der', 'der'>>{
        modulusLength: 2048,
        publicKeyEncoding: this.encoding.public,
        privateKeyEncoding: this.encoding.private(authKey)
      })
    });
  }

  static encoding = {
    public: { type: 'spki', format: 'der' },
    private: (authKey: AuthKey) => ({
      type: 'pkcs8',
      format: 'der',
      cipher: 'aes-256-cbc',
      passphrase: authKey.secret
    })
  };

  public readonly keyid: string;
  public readonly name?: string;
  public readonly publicKey: Buffer;
  private readonly privateKey?: Buffer;
  public readonly revoked: boolean;

  constructor({ keyid, name, publicKey, privateKey, revoked = false }: {
    keyid: string,
    name?: string,
    publicKey: Uint8Array,
    privateKey?: Uint8Array,
    revoked?: boolean
  }) {
    this.keyid = keyid;
    this.name = name;
    this.publicKey = Buffer.from(publicKey);
    this.privateKey = privateKey ? Buffer.from(privateKey) : undefined;
    this.revoked = revoked;
  }

  /**
   * @returns `false` if the auth key does not correspond to this user key
   */
  matches(authKey: AuthKey) {
    if (authKey.keyid !== this.keyid)
      return false; // Shortcut
    try {
      return !!this.getCryptoPrivateKey(authKey);
    } catch (e) {
      // ERR_OSSL_EVP_BAD_DECRYPT if the secret is wrong
      return false;
    }
  }

  sign(data: Uint8Array, authKey: AuthKey) {
    return Buffer.concat([
      Buffer.from(`${this.keyid}:`),
      sign('RSA-SHA256', data, this.getCryptoPrivateKey(authKey))
    ]);
  }

  verify(sig: Uint8Array, data: Uint8Array) {
    const [keyid, cryptoSig] = UserKey.splitSignature(sig);
    if (keyid !== this.keyid)
      return false;
    return verify('RSA-SHA256', data, this.getCryptoPublicKey(), cryptoSig);
  }

  /** @returns JWT */
  signJwt(payload: string | Buffer | JwtPayload, authKey: AuthKey, options?: SignOptions) {
    // noinspection JSCheckFunctionSignatures
    return signJwt(payload, this.getCryptoPrivateKey(authKey) as unknown as Secret, {
      ...options, algorithm: 'RS256', keyid: this.keyid
    });
  }

  static verifyJwt(jwt: string, getUserKey: (header: JwtHeader) => Promise<UserKey>) {
    return verifyJwt(jwt, async header =>
        (await getUserKey(header)).getCryptoPublicKey() as unknown as Secret,
      { algorithms: ['RS256'] });
  }

  /**
   * @param {AuthKey} authKey
   * @returns {[string, KeyObject]} Arguments for HTTP signing
   * @see https://httpwg.org/http-extensions/draft-ietf-httpbis-message-signatures.html
   */
  getSignHttpArgs(authKey: AuthKey): [string, KeyObject] {
    return ['rsa-v1_5-sha256', this.getCryptoPrivateKey(authKey)];
  }

  private get surePrivateKey() {
    if (this.privateKey == null)
      throw new RangeError('Private key unavailable');
    return this.privateKey;
  }

  private getCryptoPrivateKey(authKey: AuthKey): KeyObject {
    // noinspection JSCheckFunctionSignatures
    return createPrivateKey(<PrivateKeyInput>{
      key: this.surePrivateKey,
      ...UserKey.encoding.private(authKey)
    });
  }

  getCryptoPublicKey(): KeyObject {
    return createPublicKey(<PublicKeyInput>{
      key: this.publicKey,
      ...UserKey.encoding.public
    });
  }

  /**
   * @param excludePrivate `true` to exclude the private key
   */
  toJSON(excludePrivate = false): GraphSubject {
    // noinspection JSValidateTypes
    return {
      ...UserKey.refFromKeyid(this.keyid),
      '@type': 'UserKey',
      name: this.name,
      public: this.publicKey,
      private: excludePrivate ? undefined : this.privateKey,
      revoked: this.revoked
    };
  }

  /**
   * Note this is only a partial inverse of {@link fromConfig}:
   * - the user and domain are not included
   */
  toConfig(authKey: AuthKey): UserKeyConfig {
    return Object.assign(authKey.toConfig(), {
      key: {
        type: 'rsa' as 'rsa', // Typescript weirdness
        public: this.publicKey.toString('base64'),
        private: this.privateKey?.toString('base64')
        // revoked assumed false
      }
    });
  }
}