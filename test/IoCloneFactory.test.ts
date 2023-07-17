import { IoCloneFactory } from '../src/index.js';
import { Account } from '../src/server/index';
import { mock } from 'jest-mock-extended';

describe('Socket.io clone factory', () => {
  test('reusable config', async () => {
    const cloneFactory = new IoCloneFactory();
    await cloneFactory.initialise('localhost:8080');
    await expect(cloneFactory.reusableConfig({
      '@id': 'test1', '@domain': 'ex.org', genesis: false,
      gateway: 'ex.org', auth: { key: 'appid.keyid:secret' }
    }, {
      acc: mock<Account>({ name: 'myAccount' }),
      keyid: 'keyid'
    })).resolves.toEqual({
      io: {
        uri: 'https://ex.org/', // Uses public gateway
        opts: { auth: { key: '≪your-auth-key≫', user: 'myAccount' } } // Scrubs secrets
      }
    });
  });
});