import { Gateway, GatewayEnv } from './server/index';
import LOG from 'loglevel';
import { GatewayHttp } from './http';
import * as gracefulShutdown from 'http-graceful-shutdown';
import { AuthKeyStore, CloneFactory, DomainKeyStore } from './lib';
import { IoCloneFactory, IoService } from './socket.io';
import { AblyCloneFactory } from './ably/AblyCloneFactory';
import { AblyGatewayConfig, AblyKeyStore } from './ably/AblyKeyStore';

(async function () {
  const env = new GatewayEnv();
  const config = await env.loadConfig();

  // TODO: Tidy up with dependency injection
  const setupType = 'ably' in config ? 'ably' : 'io';
  let keyStore: AuthKeyStore, cloneFactory: CloneFactory;
  if (setupType === 'ably') {
    keyStore = new AblyKeyStore(<AblyGatewayConfig>config);
    cloneFactory = new AblyCloneFactory();
  } else {
    keyStore = new DomainKeyStore(config);
    cloneFactory = new IoCloneFactory();
  }

  const gateway = new Gateway(env, config, cloneFactory, keyStore);
  const http = new GatewayHttp(gateway);

  if (setupType === 'io') {
    const io = new IoService(gateway, http.server);
    io.on('error', LOG.error);
    io.on('debug', LOG.debug);
  }

  http.server.listen(config.address, async () => {
    // noinspection JSUnresolvedVariable
    LOG.info('%s listening at %s', http.server.name, http.server.url);
    await cloneFactory.initialise(http.server.url);
    try {
      await gateway.initialise();
      LOG.info('Gateway initialised');
    } catch (e) {
      LOG.error('Gateway failed to initialise', e);
    }
  });

  gracefulShutdown(http, {
    async onShutdown() {
      LOG.info('Gateway shutting down...');
      await gateway.close();
      LOG.info('Gateway shut down');
    }
  });
})();

