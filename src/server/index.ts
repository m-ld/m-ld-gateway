import { BaseGatewayConfig } from '../lib/index.js';
import type { ListenOptions } from 'net';
import type { SmtpOptions } from './Notifier';

/**
 * @typedef {object} process.env required for Gateway node startup
 * @property {string} [LOG_LEVEL] defaults to "INFO"
 * @property {string} [M_LD_GATEWAY_DATA_PATH] should point to a volume, default `/data`
 * @property {string} M_LD_GATEWAY_GATEWAY domain name or URL of gateway
 * @property {string} M_LD_GATEWAY_GENESIS "true" iff the gateway is new
 * @property {string} M_LD_GATEWAY_AUTH__KEY gateway secret key
 * @property {string} [M_LD_GATEWAY_KEY__TYPE] cryptographic key type, must be 'rsa'
 * @property {string} [M_LD_GATEWAY_KEY__PUBLIC] gateway public key base64, see UserKey
 * @property {string} [M_LD_GATEWAY_KEY__PRIVATE] gateway private key base64,
 * encrypted with auth key secret, see UserKey
 * @property {string} [M_LD_GATEWAY_ADDRESS__PORT] defaults to 8080
 * @property {string} [M_LD_GATEWAY_ADDRESS__HOST] defaults to any-network-host
 * @see https://nodejs.org/docs/latest-v16.x/api/net.html#serverlistenoptions-callback
 */
export interface GatewayConfig extends BaseGatewayConfig {
  /** Domain name or base URL */
  gateway: string | URL;
  /** Server address bind options */
  address?: ListenOptions;
  /** Activation code notifier options */
  smtp?: SmtpOptions;
}

export { GatewayEnv } from './GatewayEnv.js';
export { Gateway, Who } from './Gateway.js';
export { Authorization } from './Authorization.js';
export { Account } from './Account.js';
export { Notifier } from './Notifier.js';