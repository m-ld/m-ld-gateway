import { Gateway, GatewayConfig } from './server/index.js';
import LOG from 'loglevel';
import { GatewayHttp } from './http/index.js';
import gracefulShutdown from 'http-graceful-shutdown';
import {
  as, asLogLevel, AuthKey, CloneFactory, DomainKeyStore, Env, KeyStore, resolveDomain, validate
} from './lib/index.js';
import { logNotifier, SmtpNotifier } from './server/Notifier.js';
import { uuid } from '@m-ld/m-ld';

/**
 * @typedef {object} process.env required for Gateway node startup
 * @property {string} [LOG_LEVEL] defaults to "INFO"
 * @property {string} [M_LD_GATEWAY_DATA_PATH] should point to a volume, default `/data`
 * @property {string} M_LD_GATEWAY_GATEWAY domain name or URL of gateway
 * @property {string} M_LD_GATEWAY_GENESIS "true" iff the gateway is new
 * @property {string} M_LD_GATEWAY_AUTH__KEY gateway secret key
 * @property {string} M_LD_GATEWAY_KEY__TYPE cryptographic key type, must be 'rsa'
 * @property {string} M_LD_GATEWAY_KEY__PUBLIC gateway public key base64, see UserKey
 * @property {string} M_LD_GATEWAY_KEY__PRIVATE gateway private key base64,
 * encrypted with auth key secret, see UserKey
 * @property {string} [M_LD_GATEWAY_ADDRESS__PORT] defaults to 3000
 * @property {string} [M_LD_GATEWAY_ADDRESS__HOST] defaults to any-network-host
 * @see https://nodejs.org/docs/latest-v16.x/api/net.html#serverlistenoptions-callback
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

  const gateway = new Gateway(env, config, cloneFactory, keyStore);
  const notifier = config.smtp != null ? new SmtpNotifier(config) : logNotifier;
  const http = new GatewayHttp(gateway, notifier);

  if (setupType === 'io') {
    const { IoService } = await import('./socket.io/index.js');
    const io = new IoService(gateway, http.server.server);
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
