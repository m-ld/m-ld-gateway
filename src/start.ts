import { Gateway, GatewayEnv, Notifier } from './server/index.js';
import LOG from 'loglevel';
import { GatewayHttp } from './http/index.js';
import gracefulShutdown from 'http-graceful-shutdown';
import { AuthKey, AuthKeyStore, CloneFactory, DomainKeyStore } from './lib/index.js';
import type { AblyGatewayConfig } from './ably/index';

(async function () {
  const env = new GatewayEnv();
  const config = await env.loadConfig();

  // TODO: Tidy up with dependency injection
  const setupType = 'ably' in config ? 'ably' : 'io';
  let keyStore: AuthKeyStore, cloneFactory: CloneFactory;
  if (setupType === 'ably') {
    const { AblyCloneFactory, AblyKeyStore } = await import('./ably/index.js');
    keyStore = new AblyKeyStore(<AblyGatewayConfig>config);
    cloneFactory = new AblyCloneFactory();
  } else {
    const { IoCloneFactory } = await import('./socket.io/index.js');
    keyStore = new DomainKeyStore(AuthKey.fromString(config.auth.key).appId);
    cloneFactory = new IoCloneFactory();
  }

  const gateway = new Gateway(env, config, cloneFactory, keyStore);
  const http = new GatewayHttp(gateway,
    config.smtp != null ? new Notifier(config) : undefined);

  if (setupType === 'io') {
    const { IoService } = await import('./socket.io/index.js');
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
      http.server.close();
    }
  });

  gracefulShutdown(http.server, {
    async onShutdown() {
      LOG.info('Gateway shutting down...');
      await gateway.close();
      LOG.info('Gateway shut down');
    }
  });
})();

