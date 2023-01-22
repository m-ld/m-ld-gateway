import { DirResult, dirSync } from 'tmp';
import {
  AccountOwnedId, AuthKey, AuthKeyStore, BackendLevel, CloneFactory, Env, gatewayContext, UserKey
} from '../src/index.js';
import { join } from 'path';
import { clone as meldClone, Describe, MeldClone } from '@m-ld/m-ld';
import { MemoryLevel } from 'memory-level';
import { DeadRemotes, parseNdJson } from './fixtures.js';
import { Account, Gateway } from '../src/server/index.js';
import { GatewayHttp } from '../src/http/index.js';
import request from 'supertest';
import { mock, MockProxy } from 'jest-mock-extended';
import { Server } from 'restify';

describe('Gateway REST API', () => {
  let tmpDir: DirResult;
  let gateway: Gateway;
  let clone: MeldClone;

  beforeEach(async () => {
    tmpDir = dirSync({ unsafeCleanup: true });
    const env = new Env('app', { data: join(tmpDir.name, 'data') });
    const cloneFactory: MockProxy<CloneFactory> = mock<CloneFactory>();
    cloneFactory.clone.mockImplementation(async (config): Promise<[MeldClone, BackendLevel]> => {
      const backend = new MemoryLevel();
      clone = await meldClone(backend, DeadRemotes, config);
      return [clone, backend];
    });
    const keyStore = mock<AuthKeyStore>();
    const authKey = AuthKey.fromString('app.id:secret');
    const machineKey = UserKey.generate(authKey);
    gateway = new Gateway(env, {
      '@domain': 'ex.org',
      genesis: true,
      gateway: 'ex.org',
      ...machineKey.toConfig(authKey)
    }, cloneFactory, keyStore);
    await gateway.initialise();
  });

  afterEach(async () => {
    await gateway?.close();
    // noinspection JSUnresolvedFunction
    tmpDir.removeCallback();
  });

  test('gets context', async () => {
    const res = await request(new GatewayHttp(gateway).server)
      .get('/api/v1/context')
      .accept('application/json');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      '@base': 'http://ex.org/',
      ...gatewayContext
    });
  });

  describe('with user account', () => {
    let userKey: UserKey;
    let app: Server;
    let acc: Account;

    beforeEach(async () => {
      userKey = UserKey.generate('app.keyid:secret');
      await gateway.domain.write({
        '@id': 'test', '@type': 'Account', key: userKey.toJSON()
      });
      app = new GatewayHttp(gateway).server;
      acc = (await gateway.account('test'))!;
    });

    test('puts new subdomain', async () => {
      const res = await request(app)
        .put('/api/v1/domain/test/sd1')
        .auth('test', 'app.keyid:secret')
        .accept('application/json');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        '@domain': 'sd1.test.ex.org', genesis: false
      });
    });

    test.todo('Put subdomain with context');

    describe('with subdomain', () => {
      let sdId: AccountOwnedId;

      beforeEach(async () => {
        sdId = gateway.ownedId('test', 'sd1');
        await gateway.subdomainConfig(sdId, { acc, keyid: 'keyid' });
      });

      test('get no lock', async () => {
        const res = await request(app)
          .get('/api/v1/domain/test/sd1/state?lock')
          .auth('test', 'app.keyid:secret')
          .accept('application/json');
        expect(res.status).toBe(200);
        expect(res.headers['etag']).toMatch(/"\w+"/);
        expect(res.body).toBe(false);
      });

      test('basic write', async () => {
        const res = await request(app)
          .post('/api/v1/domain/test/sd1/state')
          .auth('test', 'app.keyid:secret')
          .send({ '@id': 'fred', name: 'Fred' });
        expect(res.status).toBe(200);
        expect(res.headers['etag']).toMatch(/"\w+"/);
        const clone = await gateway.getSubdomain(sdId);
        await expect(clone.state.read<Describe>({ '@describe': 'fred' }))
          .resolves.toEqual([{ '@id': 'fred', name: 'Fred' }]);
      });

      test('write with lock', async () => {
        const res = await request(app)
          .post('/api/v1/domain/test/sd1/state?lock')
          .auth('test', 'app.keyid:secret')
          .send({ '@id': 'fred', name: 'Fred' });
        expect(res.status).toBe(201);
        expect(res.headers['etag']).toMatch(/"\w+"/);
        expect(res.headers['location']).toMatch(/state\?lock$/);
        const clone = await gateway.getSubdomain(sdId);
        await expect(clone.state.read<Describe>({ '@describe': 'fred' }))
          .resolves.toEqual([{ '@id': 'fred', name: 'Fred' }]);
      });

      test('write multiple', async () => {
        // First write will lock
        expect((await request(app)
          .post('/api/v1/domain/test/sd1/state?lock')
          .auth('test', 'app.keyid:secret')
          .send({ '@id': 'fred', name: 'Fred' })).status).toBe(201);
        // Check lock
        expect((await request(app)
          .get('/api/v1/domain/test/sd1/state?lock')
          .auth('test', 'app.keyid:secret')
          .accept('application/json')).body).toBe(true);
        // Second write does not remove the lock
        expect((await request(app)
          .post('/api/v1/domain/test/sd1/state')
          .auth('test', 'app.keyid:secret')
          .send({ '@id': 'fred', name: 'Flintstone' })).status).toBe(200);
        // Check and remove lock
        expect((await request(app)
          .del('/api/v1/domain/test/sd1/state?lock')
          .auth('test', 'app.keyid:secret')).status).toBe(200);
        await expect(clone.read<Describe>({ '@describe': 'fred' }))
          .resolves.toEqual([{
            '@id': 'fred', name: expect.arrayContaining(['Fred', 'Flintstone'])
          }]);
      });

      test('poll for updates', async () => {
        await clone.write({ '@id': 'fred', name: 'Fred' });
        const res = await request(app)
          .post('/api/v1/domain/test/sd1/poll')
          .auth('test', 'app.keyid:secret')
          .accept('application/x-ndjson');
        expect(res.status).toBe(201);
        expect(res.headers['etag']).toMatch(/"\w+"/);
        expect(res.headers['location']).toMatch(/state\?lock$/);
        expect(parseNdJson(res.text)).toMatchObject([
          { '@insert': [{ '@id': 'fred', name: 'Fred' }] }
        ]);
      });

      test('basic read', async () => {
        await clone.write({ '@id': 'fred', name: 'Fred' });
        const res = await request(app)
          .get('/api/v1/domain/test/sd1/state')
          .query({ query: JSON.stringify({ '@describe': 'fred' }) })
          .auth('test', 'app.keyid:secret')
          .accept('application/x-ndjson');
        expect(res.status).toBe(200);
        expect(res.headers['etag']).toMatch(/"\w+"/);
        expect(parseNdJson(res.text)).toEqual([
          { '@id': 'fred', name: 'Fred' }
        ]);
      });

      test('read must match etag', async () => {
        const res = await request(app)
          .get('/api/v1/domain/test/sd1/state')
          .query({ query: JSON.stringify({ '@describe': 'fred' }) })
          .auth('test', 'app.keyid:secret')
          .accept('application/x-ndjson')
          .set('if-match', '"no-match"');
        expect(res.status).toBe(412);
      });
    });
  });
});
