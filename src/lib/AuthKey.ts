import type { AccountOwnedId } from './AccountOwnedId';

export interface AuthKeyConfig {
  auth: { key: string };
}

/**
 * TODO: Better factoring of Key, AuthKey, AuthKeyDetail and UserKey
 */
export interface Key {
  /**
   * @returns {boolean} `false` if the auth key does not correspond to this key
   */
  matches(authKey: AuthKey): boolean;
}

/**
 * An authorisation key with app, keyid and secret components
 */
export class AuthKey implements Key {
  static fromString(keyStr: string) {
    const [keyName, secret] = keyStr.split(':');
    const [appId, keyid] = keyName.split('.');
    const authKey = new AuthKey({ appId, keyid, secret });
    if (authKey.toString() !== keyStr)
      throw new RangeError(`${keyStr} is not a valid authorisation key`);
    return authKey;
  }

  public readonly appId: string;
  public readonly keyid: string;
  public readonly secret: string;

  constructor({ appId, keyid, secret }: { appId: string, keyid: string, secret: string }) {
    /** Application ID: for multi-app gateways, not used in timeld */
    this.appId = appId;
    /** Key ID: scoped to app */
    this.keyid = keyid;
    /** Secret material */
    this.secret = secret;
  }

  toString() {
    return `${this.appId}.${this.keyid}:${this.secret}`;
  }

  toConfig(): AuthKeyConfig {
    return { auth: { key: this.toString() } };
  }

  matches(that: AuthKey) {
    return this.appId === that.appId &&
      this.keyid === that.keyid &&
      this.secret === that.secret;
  }
}

/**
 * Full details of an authorisation key
 */
export interface AuthKeyDetail {
  /** The complete key including secret */
  key: AuthKey;
  /** Account name */
  name: string;
  /** The revocation status */
  revoked: boolean;
}

export type GetAuthorisedTsIds = () => Promise<AccountOwnedId[]>;

/**
 * A persistent store of keys
 */
export interface AuthKeyStore {
  /**
   * Mint a new authorisation key with the given friendly name.
   * @param name Friendly name for reference
   * @returns the key details
   */
  mintKey(name: string): Promise<AuthKeyDetail>;
  /**
   * Ping the given authorisation keyid. This operation checks that the key
   * exists, and may update its privileges; it returns the key details.
   * @param keyid
   * @param getAuthorisedTsIds callback to get authorised Timesheet IDs for the
   * requested key, if this key store supports fine-grained privileges
   * @returns the key details, or `undefined` if this keystore does not store them
   */
  pingKey(
    keyid: string,
    getAuthorisedTsIds?: GetAuthorisedTsIds
  ): Promise<AuthKeyDetail | undefined>;
}
