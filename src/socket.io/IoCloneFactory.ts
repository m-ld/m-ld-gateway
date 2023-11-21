import {
  BaseGatewayConfig, CloneFactory, ConfigContext, Env, GatewayPrincipal, resolveGateway
} from '../index.js';
import { IoRemotes, MeldIoConfig } from '@m-ld/m-ld/ext/socket.io';
import LOG from 'loglevel';

export class IoCloneFactory extends CloneFactory {
  /**
   * Set if the socket.io server address is known
   * @type {string}
   */
  private address?: string;

  async clone(
    config: BaseGatewayConfig,
    dataDir: string,
    principal?: GatewayPrincipal
  ) {
    const ioConfig = await this.ioConfig(config);
    LOG.info('IO connecting to', ioConfig.io.uri, 'for', config['@domain']);
    return super.clone(Env.mergeConfig(config, ioConfig), dataDir, principal);
  }

  initialise(address: string) {
    this.address = address;
  }

  remotes() {
    return IoRemotes;
  }

  async reusableConfig(config: BaseGatewayConfig, context: ConfigContext) {
    return Env.mergeConfig(
      super.reusableConfig(config, context),
      await this.ioConfig(config, context)
    );
  }

  private async ioConfig(config: BaseGatewayConfig, context?: ConfigContext) {
    // Reusable config always doles out public gateway address
    const uri = !context && this.address ? this.address :
      (await resolveGateway(config.gateway)).toString();
    const io: MeldIoConfig['io'] = { uri };
    // When using Socket.io, the authorisation key is sent to the server
    // See https://socket.io/docs/v4/middlewares/#sending-credentials
    // Try and resolve the most useful authorisation key possible
    if (context?.remotesAuth.includes('jwt')) {
      const jwt = await context.mintJwt?.() ?? '≪your-token≫';
      io.opts = { auth: { jwt } }
    } else if (!context?.remotesAuth.length || context.remotesAuth.includes('key')) {
      // Do not reveal the config key unless this is local
      const key = context ? '≪your-auth-key≫' : config.auth.key;
      // The user may be undefined, if this is a Gateway
      const user = context ? context.who?.acc.name ?? '≪your-account-name≫' : config.user;
      io.opts = { auth: { key, user } };
    }
    return { io };
  }
}