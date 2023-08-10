import { Gateway, GatewayConfig, SubdomainCache } from './server/index.js';
import LOG from 'loglevel';
import { setupGatewayHttp } from './http/index.js';
import gracefulShutdown from 'http-graceful-shutdown';
import {
  as, asLogLevel, AuthKey, CloneFactory, DomainKeyStore, Env, KeyStore, resolveDomain, validate
} from './lib/index.js';
import { logNotifier, SmtpNotifier } from './server/Notifier.js';
import { uuid } from '@m-ld/m-ld';
import { Liquid } from 'liquidjs';
import { fileURLToPath } from 'url';

/**
 * Note environment variables required for Gateway node startup.
 * @see ../doc/self-host.md
 */

(async function () {
  const env = new Env('m-ld-gateway', {
    // Default is a volume mount, see fly.toml
    data: process.env.M_LD_GATEWAY_DATA_PATH || '/data'
  });
// Parse command line, environment variables & configuration
  const argv = (await env.yargs()).parseSync();
  const config: GatewayConfig = validate(argv, as.object({
    '@id': as.string().default(uuid),
    // Set the m-ld domain from the gateway if not declared
    '@domain': as.string().domain().default(config => resolveDomain(config.gateway)),
    '@context': as.forbidden(), // This is hard-coded
    gateway: as.string().required(),
    genesis: as.boolean().default(false),
    auth: as.object({ // auth key specified for Gateway
      key: as.string().required()
    }).required(),
    key: as.object({ // key pair specified for Gateway
      type: as.equal('rsa').default('rsa'),
      public: as.string().base64().required(),
      private: as.string().base64().required()
    }).required(),
    address: as.object({
      port: as.number().default(3000),
      host: as.string().optional()
    }).default(3000),
    subdomainCacheSize: as.number().optional(),
    logLevel: asLogLevel.default('INFO')
  }).unknown());
  LOG.setLevel(config.logLevel ?? 'INFO');

  // TODO: Tidy up with dependency injection
  const setupType = 'ably' in config ? 'ably' : 'io';
  let keyStore: KeyStore, cloneFactory: CloneFactory;
  if (setupType === 'ably') {
    const { AblyCloneFactory, AblyKeyStore } = await import('./ably/index.js');
    keyStore = new AblyKeyStore(config);
    cloneFactory = new AblyCloneFactory();
  } else {
    const { IoCloneFactory } = await import('./socket.io/index.js');
    keyStore = new DomainKeyStore(AuthKey.fromString(config.auth.key).appId);
    cloneFactory = new IoCloneFactory();
  }

  const subdomainCache = new SubdomainCache(config);
  const gateway = new Gateway(env, config, cloneFactory, keyStore, subdomainCache);
  const server = setupGatewayHttp({
    gateway,
    notifier: config.smtp != null ? new SmtpNotifier(config) : logNotifier,
    liquid: new Liquid({
      root: fileURLToPath(new URL('../_site/', import.meta.url)),
      cache: true
    })
  });

  if (setupType === 'io') {
    const { IoService } = await import('./socket.io/index.js');
    const io = new IoService(gateway, server.server);
    io.on('error', LOG.error);
    io.on('debug', (...args) => LOG.debug(JSON.stringify(args)));
  }

  server.listen(config.address, async () => {
    // noinspection JSUnresolvedVariable
    LOG.info('%s listening at %s', server.name, server.url);
    await cloneFactory.initialise(server.url);
    try {
      await gateway.initialise();
      LOG.info('Gateway initialised');
    } catch (e) {
      LOG.error('Gateway failed to initialise', e);
      server.close();
    }
  });

  gracefulShutdown(server, {
    async onShutdown() {
      LOG.info('Gateway shutting down...');
      await gateway.close();
      LOG.info('Gateway shut down');
    }
  });
})();
