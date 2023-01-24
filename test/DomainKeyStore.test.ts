import { DomainKeyStore } from '../src/index.js';

describe('m-ld domain key store', () => {
  let ks: DomainKeyStore;

  beforeEach(async () => {
    ks = new DomainKeyStore('app');
  });

  test('mints key', async () => {
    const key = await ks.mintKey('name');
    expect(key.name).toBe('name');
    expect(key.revoked).toBe(false);
    expect(key.key.appId).toBe('app');
    expect(key.key.keyid).toMatch(/.{6}/);
    expect(key.key.secret).toMatch(/.{20,}/);
  });

  test('pings key', async () => {
    const { key: { keyid } } = await ks.mintKey('name');
    const revoked = await ks.pingKey(keyid);
    expect(revoked).toBeUndefined();
  });
});