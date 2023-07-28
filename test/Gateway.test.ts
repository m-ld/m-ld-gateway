import { clone as meldClone, MeldClone } from '@m-ld/m-ld';
import { MemoryLevel } from 'memory-level';
import { Account, Gateway } from '../src/server/index.js';
import {
  AuthKey, BackendLevel, CloneFactory, gatewayContext, KeyStore, UserKey
} from '../src/index.js';
import { join } from 'path';
import { DeadRemotes, TestEnv } from './fixtures.js';
import { existsSync } from 'fs';
import { mock, MockProxy } from 'jest-mock-extended';
import { Subdomain } from '../src/data/Subdomain.js';

describe('Gateway', () => {
  let env: TestEnv;
  let cloneFactory: MockProxy<CloneFactory>;
  let keyStore: KeyStore;
  let gateway: Gateway;

  beforeEach(async () => {
    env = new TestEnv;
    cloneFactory = mock<CloneFactory>();
    cloneFactory.clone.mockImplementation(async (config): Promise<[MeldClone, BackendLevel]> => {
      const backend = new MemoryLevel();
      const clone = await meldClone(backend, DeadRemotes, config);
      return [clone, backend];
    });
    cloneFactory.reusableConfig.mockImplementation(async config => {
      // Random key for testing of reusable config
      const { networkTimeout, maxOperationSize, logLevel, tls } = config;
      return { networkTimeout, maxOperationSize, logLevel, tls };
    });
    keyStore = mock<KeyStore>();
    const authKey = AuthKey.fromString('app.id:secret');
    gateway = new Gateway(env, {
      '@id': 'test',
      '@domain': 'ex.org',
      genesis: true,
      gateway: 'ex.org',
      ...UserKey.generate(authKey).toConfig(authKey),
      tls: true
    }, cloneFactory, keyStore);
    await gateway.initialise();
  });

  afterEach(async () => {
    await gateway?.close();
    env.tearDown();
  });

  afterEach(async () => {
  });

  test('has expected properties', () => {
    expect(gateway.domainName).toBe('ex.org');
    expect(gateway.ownedId({ account: 'test', name: 'sd1' })).toMatchObject({
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
      join(env.tmpDir.name, 'data', 'gw')
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
      const sd = new Subdomain({ account: 'test', name: 'sd1', useSignatures: true });
      const sdConfig = await gateway.subdomainConfig(sd, 'any', { acc, keyid: 'keyid' }) as any;
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
        join(env.tmpDir.name, 'data', 'domain', 'test', 'sd1'),
        { '@id': 'http://ex.org/' }
      ]);
      await expect(gateway.domain.get('test')).resolves.toMatchObject({
        '@id': 'test',
        subdomain: { '@id': 'test/sd1' }
      });
      expect(existsSync(join(env.tmpDir.name, 'data', 'domain', 'test', 'sd1')));
      // Expect subdomain clone to contain user principal for signing
      const sdc = (await gateway.getSubdomain(gateway.ownedId(sd)))!;
      await expect(sdc.state.get('http://ex.org/test')).resolves.toEqual({
        '@id': 'http://ex.org/test', '@type': 'Account', key: { '@id': '.keyid' }
      });
    });

    test('clones a new subdomain, with signatures', async () => {
      await gateway.domain.write({
        '@id': 'test',
        subdomain: {
          '@id': 'test/sd1',
          '@type': 'Subdomain',
          useSignatures: true
        }
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
        join(env.tmpDir.name, 'data', 'domain', 'test', 'sd1'),
        { '@id': 'http://ex.org/' }
      ]);
    });

    test('removes a subdomain', async () => {
      const sd = new Subdomain({ account: 'test', name: 'sd1' });
      await gateway.subdomainConfig(sd, 'any', { acc, keyid: 'keyid' });
      await gateway.domain.write({
        '@delete': { '@id': 'test', subdomain: { '@id': 'test/sd1', '?': '?' } }
      });
      // Doing another write awaits all follow handlers
      await gateway.domain.write({});
      expect(!existsSync(join(env.tmpDir.name, 'data', 'domain', 'test', 'sd1')));
      expect(gateway.hasClonedSubdomain(gateway.ownedId(sd))).toBe(false);
      // Cannot re-use a subdomain name
      await expect(gateway.subdomainConfig(sd, 'any', { acc, keyid: 'keyid' }))
        .rejects.toThrowError();
    });
  });
});