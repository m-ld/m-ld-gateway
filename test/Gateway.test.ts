import { clone as meldClone, MeldClone } from '@m-ld/m-ld';
import { MemoryLevel } from 'memory-level';
import { Account, Gateway, GatewayConfig } from '../src/server/index.js';
import {
  AuthKey, AuthKeyStore, BackendLevel, CloneFactory, Env, gatewayContext, UserKey
} from '../src/index.js';
import { DirResult, dirSync } from 'tmp';
import { join } from 'path';
import { DeadRemotes } from './fixtures.js';
import { existsSync } from 'fs';
import { mock, MockProxy } from 'jest-mock-extended';

describe('Gateway', () => {
  let env: Env;
  let cloneFactory: MockProxy<CloneFactory>;
  let tmpDir: DirResult;
  let keyStore: AuthKeyStore;
  let config: Partial<GatewayConfig>;

  beforeEach(() => {
    tmpDir = dirSync({ unsafeCleanup: true });
    env = new Env('app', { data: join(tmpDir.name, 'data') });
    cloneFactory = mock<CloneFactory>();
    cloneFactory.clone.mockImplementation(async (config): Promise<[MeldClone, BackendLevel]> => {
      const backend = new MemoryLevel();
      const clone = await meldClone(backend, DeadRemotes, config);
      return [clone, backend];
    });
    cloneFactory.reusableConfig.mockImplementation(config => {
      // Random key for testing of reusable config
      const { networkTimeout, maxOperationSize, logLevel, tls } = config;
      return { networkTimeout, maxOperationSize, logLevel, tls };
    });
    keyStore = mock<AuthKeyStore>();
    const authKey = AuthKey.fromString('app.id:secret');
    config = {
      '@id': '1',
      '@domain': 'ex.org',
      genesis: true,
      gateway: 'ex.org',
      ...UserKey.generate(authKey).toConfig(authKey)
    };
  });

  afterEach(async () => {
    // noinspection JSUnresolvedFunction
    tmpDir.removeCallback();
  });

  test('throws if no auth config', async () => {
    await expect(async () => {
      const gateway = new Gateway(
        env, { '@domain': 'ex.org' }, cloneFactory, keyStore);
      return gateway.initialise();
    }).rejects.toBeDefined();
  });

  test('throws if no domain', async () => {
    delete config['@domain'];
    await expect(async () => {
      const gateway = new Gateway(
        env, { auth: { key: 'id:secret' } }, cloneFactory, keyStore);
      return gateway.initialise();
    }).rejects.toBeDefined();
  });

  describe('initialised', () => {
    let gateway: Gateway;

    beforeEach(async () => {
      gateway = new Gateway(env, {
        ...config,
        genesis: true,
        tls: true
      }, cloneFactory, keyStore);
      await gateway.initialise();
    });

    afterEach(async () => {
      await gateway?.close();
    });

    test('has expected properties', () => {
      expect(gateway.domainName).toBe('ex.org');
      expect(gateway.ownedId('test', 'sd1')).toMatchObject({
        gateway: 'ex.org', account: 'test', name: 'sd1'
      });
      expect(gateway.ownedRefAsId({ '@id': 'test/sd1' })).toMatchObject({
        gateway: 'ex.org', account: 'test', name: 'sd1'
      });
    });

    test('has cloned the gateway domain', () => {
      expect(cloneFactory.clone.mock.calls).toMatchObject([[
        {
          '@id': expect.stringMatching(/\w+/),
          '@domain': 'ex.org',
          '@context': gatewayContext,
          genesis: true, // has to be true because dead remotes
          auth: { key: 'app.id:secret' }
        },
        join(tmpDir.name, 'data', 'gw')
      ]]);
    });

    test('has registered account', async () => {
      await gateway.domain.write({
        '@id': 'test',
        '@type': 'Account',
        email: 'test@ex.org'
      });
      await expect(gateway.account('test')).resolves.toBeInstanceOf(Account);
      await expect(gateway.account('garbage')).resolves.toBeUndefined();
    });

    describe('with account', () => {
      let acc: Account;

      beforeEach(async () => {
        await gateway.domain.write({
          '@id': 'test',
          '@type': 'Account',
          email: 'test@ex.org',
          key: UserKey.generate('appid.keyid:secret').toJSON()
        });
        acc = (await gateway.account('test'))!;
      });

      test('gets subdomain config', async () => {
        const sdId = gateway.ownedId('test', 'sd1');
        const sdConfig = await gateway.subdomainConfig(
          sdId, { acc, keyid: 'keyid' }) as any;
        expect(sdConfig).toEqual({
          '@domain': 'sd1.test.ex.org',
          genesis: false,
          tls: true
        });
        // Gateway API secrets NOT present
        expect(sdConfig['auth']).toBeUndefined();
        expect(sdConfig['smtp']).toBeUndefined();
        expect(sdConfig['tls']).toBe(true);
        // Expect to have created the subdomain genesis clone
        expect(cloneFactory.clone.mock.lastCall).toMatchObject([
          {
            '@id': expect.stringMatching(/\w+/),
            '@domain': 'sd1.test.ex.org',
            genesis: true,
            auth: { key: 'app.id:secret' },
            tls: true
          },
          join(tmpDir.name, 'data', 'domain', 'test', 'sd1'),
          { '@id': 'http://ex.org/' }
        ]);
        await expect(gateway.domain.get('test')).resolves.toMatchObject({
          '@id': 'test',
          subdomain: { '@id': 'test/sd1' }
        });
        expect(existsSync(join(tmpDir.name, 'data', 'domain', 'test', 'sd1')));
        // Expect subdomain clone to contain user principal for signing
        const sd = await gateway.getSubdomain(sdId);
        await expect(sd.state.get('http://ex.org/test')).resolves.toEqual({
          '@id': 'http://ex.org/test', '@type': 'Account', key: { '@id': '.keyid' }
        });
      });

      test('clones a new subdomain', async () => {
        await gateway.domain.write({
          '@id': 'test', subdomain: { '@id': 'test/sd1', '@type': 'Subdomain' }
        });
        // Doing another write awaits all follow handlers
        await gateway.domain.write({});
        // The gateway should attempt to clone the subdomain.
        // (It will fail due to dead remotes, but we don't care.)
        expect(cloneFactory.clone.mock.lastCall).toMatchObject([
          {
            '@id': expect.stringMatching(/\w+/),
            '@domain': 'sd1.test.ex.org',
            genesis: false,
            auth: { key: 'app.id:secret' },
            tls: true
          },
          join(tmpDir.name, 'data', 'domain', 'test', 'sd1'),
          { '@id': 'http://ex.org/' }
        ]);
      });

      test('removes a subdomain', async () => {
        const sdId = gateway.ownedId('test', 'sd1');
        await gateway.subdomainConfig(sdId, { acc, keyid: 'keyid' });
        await gateway.domain.write({
          '@delete': { '@id': 'test', subdomain: { '@id': 'test/sd1', '@type': 'Subdomain' } }
        });
        // Doing another write awaits all follow handlers
        await gateway.domain.write({});
        expect(!existsSync(join(tmpDir.name, 'data', 'domain', 'test', 'sd1')));
        expect(gateway.hasClonedSubdomain(sdId)).toBe(false);
        // Cannot re-use a subdomain name
        await expect(gateway.subdomainConfig(sdId, { acc, keyid: 'keyid' }))
          .rejects.toThrowError();
      });
    });
  });
});