import { AuthKey, DomainKeyStore, Env, IoCloneFactory, IoService, UserKey } from '../src/index.js';
import { Account, Gateway, GatewayConfig, SubdomainCache } from '../src/server/index.js';
import { createServer, Server } from 'http';
import { TestEnv } from './fixtures.js';
import { clone, MeldConfig, uuid } from '@m-ld/m-ld';
import { MemoryLevel } from 'memory-level';
import { IoRemotes, MeldIoConfig } from '@m-ld/m-ld/ext/socket.io';
import { AddressInfo } from 'net';
import { once } from 'events';

describe('Socket.io service', () => {
  let server: Server;
  let env: TestEnv;
  let gateway: Gateway;
  let serverUrl: string;
  let subdomainCache: SubdomainCache;

  beforeEach(async () => {
    env = new TestEnv();
    server = createServer();
    server.listen();
    await once(server, 'listening');
    const address = server.address() as AddressInfo;
    serverUrl = `http://localhost:${address.port}`;
    const cloneFactory = new IoCloneFactory;
    const rootKey = AuthKey.fromString('app.rootid:secret');
    const machineKey = UserKey.generate(rootKey);
    const config: GatewayConfig = {
      '@id': 'test',
      '@domain': 'ex.org',
      genesis: true,
      gateway: serverUrl,
      ...machineKey.toConfig(rootKey),
      logLevel: 'debug'
    };
    subdomainCache = new SubdomainCache(config);
    gateway = new Gateway(
      env,
      config,
      cloneFactory,
      new DomainKeyStore('app'),
      subdomainCache
    );
    new IoService(gateway, server);
    cloneFactory.initialise(serverUrl);
    await gateway.initialise();
  });

  afterEach(async () => {
    await gateway.close();
    server.close();
    await once(server, 'close');
    env.tearDown();
  });

  test('cannot connect to gateway domain with wrong key', async () => {
    const config: MeldIoConfig = {
      '@id': uuid(),
      '@domain': 'ex.org',
      genesis: false,
      io: { uri: serverUrl, opts: { auth: { key: 'app.rootid:garbage' } } }
    };
    await expect(clone(new MemoryLevel, IoRemotes, config)).rejects.toThrow();
  });

  test('can connect to gateway domain with root key', async () => {
    const config: MeldIoConfig = {
      '@id': uuid(),
      '@domain': 'ex.org',
      genesis: false,
      io: { uri: serverUrl, opts: { auth: { key: 'app.rootid:secret' } } }
    };
    const clientCloneOfGwDomain = await clone(new MemoryLevel, IoRemotes, config);
    await expect(clientCloneOfGwDomain.get('app')).resolves.toBeDefined();
    await clientCloneOfGwDomain.close();
  });

  describe('with account', () => {
    let acc: Account;
    let key: AuthKey;

    beforeEach(async () => {
      acc = await gateway.account('hanna-barbera', true);
      const { auth: { key: keyString } } = await acc.generateKey({});
      key = AuthKey.fromString(keyString);
    });

    test('can connect to unknown UUID subdomain anonymously', async () => {
      await acc.update({ '@insert': { remotesAuth: 'anon' } });
      const config: MeldIoConfig = {
        '@id': uuid(), '@domain': `${uuid()}.hanna-barbera.ex.org`,
        genesis: true, io: { uri: serverUrl }
      };
      const clientClone = await clone(new MemoryLevel, IoRemotes, config);
      await expect(clientClone.status.becomes({ online: true })).resolves.toBeDefined();
      await clientClone.close();
    });

    test('cannot connect to named subdomain anonymously', async () => {
      const subdomain = { account: acc.name, name: 'flintstones' };
      const clientConfig = Env.mergeConfig<MeldConfig>(
        await gateway.ensureNamedSubdomain(subdomain, { acc, keyid: key.keyid }),
        { '@id': uuid(), io: { opts: false } } // Remove auth placeholders
      );
      await expect(clone(new MemoryLevel, IoRemotes, clientConfig)).rejects.toThrow();
    });

    test('can connect to subdomain with user account key', async () => {
      const subdomain = { account: acc.name, name: 'flintstones' };
      const config = await gateway.ensureNamedSubdomain(subdomain, { acc, keyid: key.keyid });
      const gwClone = (await gateway.getSubdomain(gateway.ownedId(subdomain)))!;
      await gwClone.write({ '@id': 'fred', name: 'Fred' });
      await gwClone.unlock();
      // Add id and user credentials into the generated config
      const clientConfig = Env.mergeConfig<MeldConfig>(config, {
        '@id': uuid(), io: { opts: { auth: { key: key.toString(), user: acc.name } } }
      });
      const clientClone = await clone(new MemoryLevel, IoRemotes, clientConfig);
      await expect(clientClone.get('fred')).resolves.toBeDefined();
      await clientClone.close();
    });

    test.todo('can connect to subdomain with user-signed JWT');

    test('can connect to a domain cleared from the cache', async () => {
      const subdomain = { account: acc.name, name: 'flintstones' };
      const config = await gateway.ensureNamedSubdomain(subdomain, { acc, keyid: key.keyid });
      await subdomainCache.clear();
      expect(subdomainCache.has(gateway.ownedId(subdomain).toDomain())).toBe(false);
      const clientConfig = Env.mergeConfig<MeldConfig>(config, {
        '@id': uuid(), io: { opts: { auth: { key: key.toString(), user: acc.name } } }
      });
      const clientClone = await clone(new MemoryLevel, IoRemotes, clientConfig);
      expect(clientClone).toBeDefined();
      await clientClone.close();
    });
  });
});