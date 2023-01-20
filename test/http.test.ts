import { DirResult, dirSync } from 'tmp';
import {
  AuthKey, AuthKeyStore, BackendLevel, CloneFactory, Env, gatewayContext, UserKey
} from '../src/index.js';
import { join } from 'path';
import { clone as meldClone, MeldClone } from '@m-ld/m-ld';
import { MemoryLevel } from 'memory-level';
import { DeadRemotes } from './fixtures.js';
import { Account, Gateway } from '../src/server/index.js';
import { GatewayHttp } from '../src/http/index.js';
import request from 'supertest';
import { mock } from 'jest-mock-extended';
import { Server } from 'restify';

describe('Gateway REST API', () => {
  let tmpDir: DirResult;
  let gateway: Gateway;

  beforeEach(async () => {
    tmpDir = dirSync({ unsafeCleanup: true });
    const env = new Env('app', { data: join(tmpDir.name, 'data') });
    const cloneFactory = mock<CloneFactory>();
    cloneFactory.clone.mockImplementation(async (config): Promise<[MeldClone, BackendLevel]> => {
      const backend = new MemoryLevel();
      const clone = await meldClone(backend, DeadRemotes, config);
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

    describe('with subdomain', () => {
      beforeEach(async () => {
        await gateway.subdomainConfig(
          gateway.ownedId('test', 'sd1'),
          { acc, keyid: 'keyid' });
      });

      test('can write', async () => {
        let res = await request(app)
          .post('/api/v1/domain/test/sd1/state')
          .auth('test', 'app.keyid:secret')
          .send({ '@id': 'fred', name: 'Fred' });
        expect(res.status).toBe(200);
        res = await request(app)
          .get('/api/v1/domain/test/sd1/state')
          .query({ query: JSON.stringify({ '@describe': 'fred' }) })
          .auth('test', 'app.keyid:secret')
          .accept('application/x-ndjson');
        expect(res.status).toBe(200);
        expect(res.text.split('\n').map(json => JSON.parse(json))).toEqual([
          { '@id': 'fred', name: 'Fred' }
        ]);
      });
    });

  });
});