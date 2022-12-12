import { DomainKeyStore } from '../src/index.js';
import { shortId, uuid } from '@m-ld/m-ld';

describe('m-ld domain key store', () => {
  let ks: DomainKeyStore;

  beforeEach(async () => {
    ks = new DomainKeyStore({
      '@id': uuid(),
      '@domain': 'test.ex.org',
      genesis: false
    });
  });

  test('mints key', async () => {
    const key = await ks.mintKey('name');
    expect(key.name).toBe('name');
    expect(key.revoked).toBe(false);
    expect(key.key.appId).toBe(shortId('test.ex.org'));
    expect(key.key.keyid).toMatch(/.{6}/);
    expect(key.key.secret).toMatch(/.{20,}/);
  });

  test('pings key', async () => {
    const { key: { keyid } } = await ks.mintKey('name');
    const revoked = await ks.pingKey(keyid);
    expect(revoked).toBeUndefined();
  });
});