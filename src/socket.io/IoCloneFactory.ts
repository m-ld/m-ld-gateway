import { BaseGatewayConfig, CloneFactory, Env, GatewayPrincipal, resolveGateway } from '..';
import { IoRemotes } from '@m-ld/m-ld/ext/socket.io';
import LOG from 'loglevel';
import { MeldConfig } from '@m-ld/m-ld';

export class IoCloneFactory extends CloneFactory {
  /**
   * Set if the socket.io server address is known
   * @type {string}
   */
  private address: string;

  async clone(
    config: BaseGatewayConfig,
    dataDir: string,
    principal?: GatewayPrincipal
  ) {
    const { root } = resolveGateway(this.address ?? config.gateway);
    const uri = (await root).toString();
    LOG.info('IO connecting to', uri, 'for', config['@domain']);
    return super.clone(Env.mergeConfig(config, {
      // When using Socket.io, the authorisation key is sent to the server
      // See https://socket.io/docs/v4/middlewares/#sending-credentials
      io: {
        uri: uri,
        opts: {
          auth: {
            ...config.auth,
            // The user may be undefined, if this is a Gateway
            user: config.user
          }
        }
      }
    }), dataDir, principal);
  }

  initialise(address: string) {
    this.address = address;
  }

  remotes(config: MeldConfig) {
    return IoRemotes;
  }
}