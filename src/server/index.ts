import { BaseGatewayConfig } from '../lib/index.js';
import type { ListenOptions } from 'net';
import type { SmtpOptions } from './Notifier.js';
import { UserKeyConfig } from '../data/UserKey.js';

export interface GatewayConfig extends BaseGatewayConfig, UserKeyConfig {
  /** Server address bind options */
  address?: ListenOptions;
  /** Activation code notifier options */
  smtp?: SmtpOptions;
}

export { Gateway, Who } from './Gateway.js';
export { Authorization } from './Authorization.js';
export { Account } from './Account.js';
export { Notifier } from './Notifier.js';