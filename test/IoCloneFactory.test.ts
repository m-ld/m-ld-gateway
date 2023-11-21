import { IoCloneFactory } from '../src/index.js';
import { Account } from '../src/server/index.js';
import { mock } from 'jest-mock-extended';

describe('Socket.io clone factory', () => {
  test('reusable config with key', async () => {
    const cloneFactory = new IoCloneFactory();
    cloneFactory.initialise('localhost:8080');
    await expect(cloneFactory.reusableConfig({
      '@id': 'test1', '@domain': 'ex.org', genesis: false,
      gateway: 'ex.org', auth: { key: 'appid.keyid:secret' }
    }, {
      who: {
        acc: mock<Account>({ name: 'myAccount' }),
        key: { keyid: 'keyid' }
      },
      remotesAuth: [/*'key' is the default*/]
    })).resolves.toEqual({
      io: {
        uri: 'https://ex.org/', // Uses public gateway
        opts: { auth: { key: '≪your-auth-key≫', user: 'myAccount' } } // Scrubs secrets
      }
    });
  });

  test('reusable config with JWT placeholder', async () => {
    const cloneFactory = new IoCloneFactory();
    cloneFactory.initialise('localhost:8080');
    await expect(cloneFactory.reusableConfig({
      '@id': 'test1', '@domain': 'ex.org', genesis: false,
      gateway: 'ex.org', auth: { key: 'appid.keyid:secret' }
    }, {
      remotesAuth: ['jwt']
    })).resolves.toEqual({
      io: {
        uri: 'https://ex.org/', // Uses public gateway
        opts: { auth: { jwt: '≪your-token≫' } }
      }
    });
  });

  test('reusable config with minted JWT', async () => {
    const cloneFactory = new IoCloneFactory();
    cloneFactory.initialise('localhost:8080');
    await expect(cloneFactory.reusableConfig({
      '@id': 'test1', '@domain': 'ex.org', genesis: false,
      gateway: 'ex.org', auth: { key: 'appid.keyid:secret' }
    }, {
      remotesAuth: ['jwt'],
      async mintJwt() { return 'myJwt' }
    })).resolves.toEqual({
      io: {
        uri: 'https://ex.org/', // Uses public gateway
        opts: { auth: { jwt: 'myJwt' } }
      }
    });
  });

  test('reusable config with anon', async () => {
    const cloneFactory = new IoCloneFactory();
    cloneFactory.initialise('localhost:8080');
    await expect(cloneFactory.reusableConfig({
      '@id': 'test1', '@domain': 'ex.org', genesis: false,
      gateway: 'ex.org', auth: { key: 'appid.keyid:secret' }
    }, {
      remotesAuth: ['anon']
    })).resolves.toEqual({
      io: { uri: 'https://ex.org/' }
    });
  });
});