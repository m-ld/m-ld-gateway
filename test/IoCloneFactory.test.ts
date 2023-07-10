import { IoCloneFactory } from '../src/index.js';

describe('Socket.io clone factory', () => {
  test('reusable config', async () => {
    const cloneFactory = new IoCloneFactory();
    await cloneFactory.initialise('localhost:8080');
    await expect(cloneFactory.reusableConfig({
      '@id': 'test1', '@domain': 'ex.org', genesis: false,
      gateway: 'ex.org', auth: { key: 'appid.keyid:secret' }
    })).resolves.toEqual({
      io: {
        uri: 'https://ex.org/', // Uses public gateway
        opts: { auth: { key: '', user: '' } } // Scrubs secrets
      }
    });
  });
});