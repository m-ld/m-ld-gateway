import * as ablyModule from '@m-ld/m-ld/ext/ably';
import {
  BaseGatewayConfig, CloneFactory, ConfigContext, Env, GatewayPrincipal
} from '../lib/index.js';
import * as xirsys from '@m-ld/io-web-runtime/dist/server/xirsys';

type AblyGatewayConfig = BaseGatewayConfig & ablyModule.MeldAblyConfig;

// noinspection JSUnusedGlobalSymbols
export class AblyCloneFactory extends CloneFactory {
  initialise(address: string) {}

  async clone(
    config: AblyGatewayConfig,
    dataDir: string,
    principal?: GatewayPrincipal
  ) {
    return super.clone(Env.mergeConfig(config, {
      // When using Ably, the authorisation key is an Ably key
      ably: { key: config.auth.key }
    }), dataDir, principal);
  }

  // TODO: This is a duplication of m-ld-cli/ext/ably.js
  async remotes(config: AblyGatewayConfig) {
    // Load WRTC config from Xirsys if available
    if ('xirsys' in config)
      config.wrtc = await xirsys.loadWrtcConfig(config.xirsys);
    if ('wrtc' in config)
      return ablyModule.AblyWrtcRemotes;
    else
      return ablyModule.AblyRemotes;
  }

  async reusableConfig(config: BaseGatewayConfig, context: ConfigContext) {
    const { ably } = config;
    return Env.mergeConfig(super.reusableConfig(config, context), { ably }, {
      ably: { key: false, apiKey: false } // Remove Ably secrets
    });
  }
}