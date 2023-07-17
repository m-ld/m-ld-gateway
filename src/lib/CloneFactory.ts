import { ClassicLevel } from 'classic-level';
import {
  AppPrincipal, Attribution, clone as meldClone, ConstructRemotes, InitialApp, MeldClone,
  MeldConfig, MeldReadState, MeldTransportSecurity, propertyValue
} from '@m-ld/m-ld';
import { AuthKey } from './AuthKey.js';
import { gatewayVocab } from '../data/index.js';
import { UserKey, UserKeyConfig } from '../data/UserKey.js';
import { SignOptions } from 'jsonwebtoken';
import { KeyObject } from 'crypto';
import { BaseGatewayConfig } from './BaseGateway.js';
import { AbstractLevel } from 'abstract-level';
import { Who } from '../server/index';

export type BackendLevel = AbstractLevel<unknown, string, unknown>;

export abstract class CloneFactory {
  async clone(
    config: BaseGatewayConfig,
    dataDir: string,
    principal?: GatewayPrincipal
  ): Promise<[MeldClone, BackendLevel]> {
    // noinspection JSCheckFunctionSignatures
    const backend = new ClassicLevel<string, Buffer>(
      dataDir, { valueEncoding: 'buffer' });
    const clone = await meldClone(
      backend,
      await this.remotes(config),
      config,
      new GatewayApp(config['@domain'], principal));
    return [clone, backend];
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
  async reusableConfig(
    config: BaseGatewayConfig,
    who?: Who
  ): Promise<Partial<BaseGatewayConfig>> {
    const { networkTimeout, maxOperationSize, logLevel } = config;
    return { networkTimeout, maxOperationSize, logLevel };
  }
}

export class GatewayPrincipal implements AppPrincipal {
  readonly '@id': string;
  readonly authKey: AuthKey;
  readonly userKey: UserKey;
  readonly signer?: {
    signData(data: Buffer): Buffer,
    signJwt(payload: string | Buffer | object, options?: SignOptions): Promise<string>,
    getSignHttpArgs(): [string, KeyObject]
  };

  /**
   * @param id absolute principal IRI
   * @param config
   */
  constructor(id: string, config: UserKeyConfig) {
    this['@id'] = id;
    this.authKey = AuthKey.fromString(config.auth.key);
    this.userKey = UserKey.fromConfig(config);
    this.signer = {
      signData: data => this.userKey.sign(data, this.authKey),
      signJwt: (payload, options) =>
        this.userKey.signJwt(payload, this.authKey, options),
      /** @returns Arguments for HTTP signing */
      getSignHttpArgs: () => this.userKey.getSignHttpArgs(this.authKey)
    };
  }

  /** We do not implement sign, it's delegated to the userKey */
  sign = undefined;
}

export class GatewayApp implements InitialApp {
  readonly transportSecurity?: MeldTransportSecurity;

  constructor(
    domain: string,
    readonly principal?: GatewayPrincipal
  ) {
    if (principal?.signer != null) {
      this.transportSecurity = {
        wire: data => data, // We don't apply wire encryption, yet
        sign: this.sign,
        verify: GatewayApp.verify(domain)
      };
    }
    // TODO: Security constraint: only gateway can add/remove users
  }

  sign = (data: Buffer): Attribution => ({
    sig: this.principal!.signer!.signData(data),
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
