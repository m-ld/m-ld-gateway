import { ClassicLevel } from 'classic-level';
import {
  AppPrincipal, Attribution, clone as meldClone, ConstructRemotes, InitialApp, MeldClone,
  MeldConfig, MeldReadState, MeldTransportSecurity, propertyValue
} from '@m-ld/m-ld';
import { AuthKey } from './AuthKey';
import { gatewayVocab } from '../data';
import { UserKey, UserKeyConfig } from '../data/UserKey';
import { SignOptions } from 'jsonwebtoken';
import { KeyObject } from 'crypto';
import { BaseGatewayConfig } from './BaseGateway';

/**
 * @abstract
 */
export abstract class CloneFactory {
  async clone(
    config: BaseGatewayConfig,
    dataDir: string,
    principal?: GatewayPrincipal
  ): Promise<MeldClone> {
    // noinspection JSCheckFunctionSignatures
    return meldClone(
      new ClassicLevel(dataDir),
      await this.remotes(config),
      config,
      new GatewayApp(config['@domain'], principal));
  }

  /**
   * Async initialisation of the factory
   * @param address gateway server address
   */
  abstract initialise(address: string): void | Promise<unknown>;

  /**
   * @param {MeldConfig} config
   * @returns {ConstructRemotes | Promise<ConstructRemotes>}
   */
  abstract remotes(config: BaseGatewayConfig): ConstructRemotes | Promise<ConstructRemotes>;

  /**
   * @returns the subset of configuration that can be re-used by other engines
   * cloning the same domains
   */
  reusableConfig(config: BaseGatewayConfig): Partial<BaseGatewayConfig> {
    const { networkTimeout, maxOperationSize, logLevel } = config;
    return { networkTimeout, maxOperationSize, logLevel };
  }
}

export class GatewayPrincipal implements AppPrincipal {
  public readonly '@id': string;
  private readonly authKey: AuthKey;
  private readonly userKey: UserKey;

  /**
   * @param {string} id absolute principal IRI
   * @param {UserKeyConfig} config
   */
  constructor(id: string, config: UserKeyConfig) {
    this['@id'] = id;
    this.authKey = AuthKey.fromString(config.auth.key);
    this.userKey = UserKey.fromConfig(config);
  }

  toConfig() {
    return this.userKey.toConfig(this.authKey);
  }

  /**
   * We do not implement sign, it's delegated to the userKey
   * @type {*}
   */
  sign = undefined;

  signData(data: Buffer) {
    return this.userKey.sign(data, this.authKey);
  }

  signJwt(payload: string | Buffer | object, options?: SignOptions) {
    // noinspection JSCheckFunctionSignatures
    return this.userKey.signJwt(payload, this.authKey, options);
  }

  /** @returns Arguments for HTTP signing */
  getSignHttpArgs(): [string, KeyObject] {
    return this.userKey.getSignHttpArgs(this.authKey);
  }
}

export class GatewayApp implements InitialApp {
  readonly transportSecurity: MeldTransportSecurity;

  constructor(
    domain: string,
    readonly principal?: GatewayPrincipal
  ) {
    // noinspection JSUnusedGlobalSymbols
    this.transportSecurity = {
      wire: data => data, // We don't apply wire encryption, yet
      sign: principal != null ? this.sign : undefined,
      verify: GatewayApp.verify(domain)
    };
    // TODO: Security constraint: only gateway can add/remove users
  }

  sign = (data: Buffer): Attribution => ({
    sig: this.principal!.signData(data),
    pid: this.principal!['@id']
  });

  /**
   * @param {string} domain name
   * @returns import('@m-ld/m-ld').MeldTransportSecurity['verify']
   */
  static verify(domain: string) {
    return async (data: Uint8Array, attr: Attribution, state: MeldReadState) => {
      // Load the declared user info from the data
      const [keyid] = UserKey.splitSignature(attr.sig);
      if (keyid == null)
        throw new Error('Signature has no keyid');
      // Gotcha: verify is called without a context; all IRIs must be absolute
      const keyRef = UserKey.refFromKeyid(keyid, domain);
      const exists = await state.ask({
        '@where': { '@id': attr.pid, [gatewayVocab('key')]: keyRef }
      });
      if (!exists)
        throw new Error(`Principal ${attr.pid} not found`);
      const keySrc = await state.get(keyRef['@id']);
      if (keySrc == null)
        throw new Error('Signature key not found');
      const userKey = new UserKey({
        keyid: UserKey.keyidFromRef(keySrc),
        publicKey: propertyValue(keySrc, gatewayVocab('public'), Uint8Array)
      });
      if (!userKey.verify(attr.sig, data))
        throw new Error('Signature not valid');
    };
  }
}
