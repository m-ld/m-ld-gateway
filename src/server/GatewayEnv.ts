import { Env } from '../lib/Env.js';
import LOG from 'loglevel';
import isFQDN from 'validator/lib/isFQDN.js';
import { GatewayConfig } from './index.js';

export class GatewayEnv extends Env {
  constructor() {
    super('m-ld-gateway', {
      // Default is a volume mount, see fly.toml
      data: process.env.M_LD_GATEWAY_DATA_PATH || '/data'
    });
  }

  /**
   * Parse command line, environment variables & configuration
   */
  async loadConfig(): Promise<GatewayConfig> {
    // Parse command line, environment variables & configuration
    const argv = (await this.yargs())
      .demandOption(['gateway', 'auth'])
      .default('genesis', false)
      .option('address.port', { default: '8080', type: 'number' })
      .parse();
    // Not type-perfect, later failures may occur
    const config = <Partial<GatewayConfig>>argv;
    LOG.setLevel(config.logLevel || 'INFO');
    LOG.debug('Loaded configuration', config);
    // Set the m-ld domain from the declared gateway
    if (config['@domain'] == null) {
      config['@domain'] =
        typeof config.gateway == 'string' && isFQDN(config.gateway) ?
          config.gateway : new URL(config.gateway!).hostname;
    }
    return <GatewayConfig>config;
  }
}