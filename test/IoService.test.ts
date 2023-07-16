import { AuthKey, DomainKeyStore, Env, IoCloneFactory, IoService, UserKey } from '../src/index';
import { Gateway } from '../src/server/index';
import { createServer, Server } from 'http';
import { TestEnv } from './fixtures';
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
    gateway = new Gateway(env, {
      '@domain': 'ex.org',
      genesis: true,
      gateway: serverUrl,
      ...machineKey.toConfig(rootKey),
      logLevel: 'debug'
    }, cloneFactory, new DomainKeyStore('app'));
    new IoService(gateway, server);
    await cloneFactory.initialise(serverUrl);
    await gateway.initialise();
  });

  afterEach(async () => {
    await gateway.close();
    await once(server.close(), 'close');
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

  test('cannot connect to named subdomain anonymously', async () => {
    const acc = await gateway.account('hanna-barbera', true);
    const { auth: { key } } = await acc.generateKey({});
    const user = acc.name;
    const { keyid } = AuthKey.fromString(key);
    const subdomain = { account: user, name: 'flintstones' };
    const clientConfig = Env.mergeConfig<MeldConfig>(
      await gateway.subdomainConfig(subdomain, { acc, keyid }),
      { '@id': uuid(), io: { opts: false } } // Remove auth placeholders
    );
    await expect(clone(new MemoryLevel, IoRemotes, clientConfig)).rejects.toThrow();
  });

  test('can connect to subdomain with user account key', async () => {
    const acc = await gateway.account('hanna-barbera', true);
    const user = acc.name;
    const { auth: { key } } = await acc.generateKey({});
    const { keyid } = AuthKey.fromString(key);
    const subdomain = { account: user, name: 'flintstones' };
    const config = await gateway.subdomainConfig(subdomain, { acc, keyid });
    const gwClone = (await gateway.getSubdomain(gateway.ownedId(subdomain)))!;
    await gwClone.write({ '@id': 'fred', name: 'Fred' });
    await gwClone.unlock();
    // Add id and user credentials into the generated config
    const clientConfig = Env.mergeConfig<MeldConfig>(config, {
      '@id': uuid(), io: { opts: { auth: { key, user } } }
    });
    const clientClone = await clone(new MemoryLevel, IoRemotes, clientConfig);
    await expect(clientClone.get('fred')).resolves.toBeDefined();
    await clientClone.close();
  });

  test.todo('can connect to subdomain with user-signed JWT');

  test('can connect to unknown UUID subdomain anonymously', async () => {
    const acc = await gateway.account('hanna-barbera', true);
    await acc.update({ '@update': { naming: 'uuid' } });
    const config: MeldIoConfig = {
      '@id': uuid(), '@domain': `${uuid()}.hanna-barbera.ex.org`,
      genesis: true, io: { uri: serverUrl }
    };
    const clientClone = await clone(new MemoryLevel, IoRemotes, config);
    await expect(clientClone.status.becomes({ online: true })).resolves.toBeDefined();
    await clientClone.close();
  });
});