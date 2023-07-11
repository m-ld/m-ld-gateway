import { Env } from '../lib/Env.js';
import LOG from 'loglevel';
import { GatewayConfig } from './index.js';
import { AuthKeyConfig, isFQDN } from '../lib/index';

export type LoadedConfig =
  AuthKeyConfig & { '@domain': string } & Partial<GatewayConfig>;

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
  async loadConfig(): Promise<LoadedConfig> {
    // Parse command line, environment variables & configuration
    const argv = <Partial<GatewayConfig>>(await this.yargs())
      .demandOption(['gateway', 'auth'])
      .default('genesis', false)
      .option('address.port', { default: '8080', type: 'number' })
      .parse();
    LOG.setLevel(argv.logLevel || 'INFO');
    LOG.debug('Loaded configuration', argv);
    // Set the m-ld domain from the declared gateway
    if (argv['@domain'] == null) {
      argv['@domain'] =
        typeof argv.gateway == 'string' && isFQDN(argv.gateway) ?
          argv.gateway : new URL(argv.gateway!).hostname;
    }
    return argv as LoadedConfig;
  }
}