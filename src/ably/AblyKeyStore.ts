import { fetchJson as defaultFetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';
import {
  AccountOwnedId, AuthKey, AuthKeyDetail, AuthKeyStore, BaseGatewayConfig, GetAuthorisedTsIds
} from '../lib/index.js';

/** Auth key contains appid */
export interface AblyGatewayConfig extends BaseGatewayConfig {
  /**
   * Control API access token
   * @see https://ably.com/docs/api/control-api#section/Authentication/bearer_auth
   */
  ably: { apiKey: string };
}

export class AblyKeyStore implements AuthKeyStore {
  private readonly fetchJson: typeof defaultFetchJson;
  private readonly domainName: string;

  constructor(config: AblyGatewayConfig, fetchJson = defaultFetchJson) {
    const [appId] = config.auth.key.split('.');
    this.fetchJson = ((path, params, options) => fetchJson(
      `https://control.ably.net/v1/apps/${appId}/${path}`, params, {
        headers: { Authorization: `Bearer ${config.ably.apiKey}` }, ...options
      }));
    this.domainName = config['@domain'];
  }

  /**
   * @see https://ably.com/docs/api/control-api#tag/keys/paths/~1apps~1{app_id}~1keys/post
   */
  async mintKey(name: string) {
    return this.ablyToAuthDetail(await this.fetchJson('keys', {}, {
      method: 'POST', body: JSON.stringify({ name, capability: this.keyCapability() })
    }));
  }

  /**
   * Note: this call works even if both name and capability are missing; and can
   * therefore be used to check if a keyid exists
   *
   * @see https://ably.com/docs/api/control-api#tag/keys/paths/~1apps~1{app_id}~1keys/post
   */
  async pingKey(keyid: string, getAuthorisedTsIds: GetAuthorisedTsIds) {
    return this.ablyToAuthDetail(await this.fetchJson(`keys/${keyid}`, {}, {
      method: 'PATCH', body: JSON.stringify({
        capability: this.keyCapability(...await getAuthorisedTsIds())
      })
    }));
  }

  ablyToAuthDetail({ key, name, status }: {
    key: string, name: string, status: 0 | 1
  }): AuthKeyDetail {
    return { key: AuthKey.fromString(key), name, revoked: status === 1 };
  }

  keyCapability(...tsIds: AccountOwnedId[]) {
    return Object.assign({
      // Ably keys must have a capability. Assign a notification channels as a minimum.
      [`${this.domainName}:notify`]: ['subscribe']
    }, ...tsIds.map(tsId => ({
      [`${tsId.toDomain()}:*`]: ['publish', 'subscribe', 'presence']
    })));
  }
}