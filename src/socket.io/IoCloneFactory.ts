import {
  BaseGatewayConfig, CloneFactory, Env, GatewayPrincipal, resolveGateway
} from '../index.js';
import { IoRemotes } from '@m-ld/m-ld/ext/socket.io';
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

  remotes(config: BaseGatewayConfig) {
    return IoRemotes;
  }

  async reusableConfig(config: BaseGatewayConfig): Promise<Partial<BaseGatewayConfig>> {
    return Env.mergeConfig(super.reusableConfig(config),
      await this.ioConfig(config, true));
  }

  private async ioConfig(config: BaseGatewayConfig, reusable = false) {
    // Reusable config always doles out public gateway address
    const uri = !reusable && this.address ? this.address :
      (await resolveGateway(config.gateway.toString()).root).toString();
    const key = reusable ? '' : config.auth.key;
    // The user may be undefined, if this is a Gateway
    const user = reusable ? '' : config.user;
    return {
      // When using Socket.io, the authorisation key is sent to the server
      // See https://socket.io/docs/v4/middlewares/#sending-credentials
      io: { uri, opts: { auth: { key, user } } }
    };
  }
}