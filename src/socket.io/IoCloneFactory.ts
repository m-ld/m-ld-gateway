import {
  BaseGatewayConfig, CloneFactory, Env, GatewayPrincipal, resolveGateway
} from '../index.js';
import { IoRemotes, MeldIoConfig } from '@m-ld/m-ld/ext/socket.io';
import LOG from 'loglevel';
import { Who } from '../server/index.js';
import { RemotesAuthType } from '../server/Account.js';

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

  async reusableConfig(
    config: BaseGatewayConfig,
    remotesAuth: RemotesAuthType[],
    who?: Who
  ): Promise<Partial<BaseGatewayConfig>> {
    return Env.mergeConfig(super.reusableConfig(config, remotesAuth, who),
      await this.ioConfig(config, { remotesAuth, who }));
  }

  private async ioConfig(
    config: BaseGatewayConfig,
    reusable?: { remotesAuth: RemotesAuthType[], who?: Who }
  ) {
    // Reusable config always doles out public gateway address
    const uri = !reusable && this.address ? this.address :
      (await resolveGateway(config.gateway.toString()).root).toString();
    const io: MeldIoConfig['io'] = { uri };
    // When using Socket.io, the authorisation key is sent to the server
    // See https://socket.io/docs/v4/middlewares/#sending-credentials
    if (!reusable || !reusable.remotesAuth.length || reusable.remotesAuth.includes('key')) {
      const key = reusable ? '≪your-auth-key≫' : config.auth.key;
      // The user may be undefined, if this is a Gateway
      const user = reusable ? reusable.who?.acc.name ?? '≪your-account-name≫' : config.user;
      io.opts = { auth: { key, user } };
    } else if (reusable.remotesAuth.includes('jwt')) {
      io.opts = { auth: { jwt: '≪your-token≫' } }
    }
    return { io };
  }
}