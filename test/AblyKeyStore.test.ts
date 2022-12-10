import { jest } from '@jest/globals';
import { AblyKeyStore } from '../src/ably/AblyKeyStore';
import { AccountOwnedId } from '..';
import type { fetchJson as defaultFetchJson } from '@m-ld/io-web-runtime/dist/server/fetch';

describe('Ably as a key store', () => {
  let keyStore: AblyKeyStore;
  let fetchJson: typeof defaultFetchJson;

  beforeEach(() => {
    fetchJson = jest.fn(async () => (<any>{
      id: 'keyid',
      name: 'hello',
      key: 'appid.keyid:secret',
      capability: {} // ignored
    }));
    keyStore = new AblyKeyStore({
      '@id': '1',
      '@domain': 'ex.org',
      auth: { key: 'appid.topId.topSecret' },
      ably: { apiKey: 'apiKey' },
      gateway: 'ex.org',
      genesis: true
    }, fetchJson);
  });

  test('mint key sets base capability', async () => {
    await keyStore.mintKey('hello');
    expect(fetchJson).toBeCalledWith('https://control.ably.net/v1/apps/appid/keys', {}, {
      method: 'POST',
      body: JSON.stringify({ name: 'hello', capability: { 'ex.org:notify': ['subscribe'] } }),
      headers: { 'Authorization': 'Bearer apiKey' }
    });
  });

  test('ping key updates capability', async () => {
    await keyStore.pingKey('keyid',
      async () => [AccountOwnedId.fromString('test/ts1@ex.org')]);
    expect(fetchJson).toBeCalledWith('https://control.ably.net/v1/apps/appid/keys/keyid', {}, {
      method: 'PATCH', body: JSON.stringify({
        capability: {
          'ex.org:notify': ['subscribe'],
          'ts1.test.ex.org:*': ['publish', 'subscribe', 'presence']
        }
      }),
      headers: { 'Authorization': 'Bearer apiKey' }
    });
  });
});