// noinspection SpellCheckingInspection

import { AccountOwnedId, AuthKey, DomainKeyStore, gatewayContext, UserKey } from '../src/index.js';
import { Describe, MeldClone, uuid } from '@m-ld/m-ld';
import { parseNdJson, TestCloneFactory, testCloneFactory, TestEnv } from './fixtures.js';
import { Account, Gateway, Notifier, SubdomainCache } from '../src/server/index.js';
import { setupGatewayHttp } from '../src/http/index.js';
import request from 'supertest';
import { anyString, mock, MockProxy } from 'jest-mock-extended';
import { Server } from 'restify';
import { Readable } from 'stream';
import type { Liquid } from 'liquidjs';
import { decode } from 'jsonwebtoken';

describe('Gateway HTTP API', () => {
  let env: TestEnv;
  let gateway: Gateway;
  let notifier: MockProxy<Notifier>;
  let liquid: MockProxy<Liquid>;
  let cloneFactory: TestCloneFactory;
  let app: Server;

  beforeEach(async () => {
    env = new TestEnv();
    cloneFactory = testCloneFactory();
    const authKey = AuthKey.fromString('app.rootid:secret');
    const machineKey = UserKey.generate(authKey);
    const config = {
      '@id': 'test',
      '@domain': 'ex.org',
      genesis: true,
      gateway: 'ex.org',
      ...machineKey.toConfig(authKey)
    };
    gateway = new Gateway(
      env,
      config,
      cloneFactory,
      new DomainKeyStore('app'),
      new SubdomainCache(config)
    );
    await gateway.initialise();
    notifier = mock<Notifier>();
    liquid = mock<Liquid>({ options: { root: ['fakeRoot'] } });
    app = setupGatewayHttp({ gateway, notifier, liquid });
  });

  afterEach(async () => {
    await gateway?.close();
    env.tearDown();
  });

  describe('website', () => {
    test('head a page', async () => {
      await request(app)
        .head('/a')
        .accept('text/html')
        .expect('Content-Type', 'text/html')
        .expect('Transfer-Encoding', 'chunked')
        .expect(200);
      expect(liquid.parseFile).toBeCalledWith('a');
    });

    test('get index page', async () => {
      liquid.renderFileToNodeStream
        .mockResolvedValue(Readable.from(['html']));
      await request(app)
        .get('/')
        .accept('text/html')
        .expect('Content-Type', 'text/html')
        .expect('Transfer-Encoding', 'chunked')
        .expect(200, 'html');
      expect(liquid.renderFileToNodeStream).toBeCalledWith('index', {
        origin: 'https://ex.org',
        domain: 'ex.org',
        root: 'app',
        version: expect.any(String)
      });
    });

    test.todo('/activate route');
  });

  test('gets context', async () => {
    const res = await request(app)
      .get('/api/v1/context')
      .accept('application/json');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      '@base': 'http://ex.org/',
      ...gatewayContext
    });
  });

  test('gets root public key', async () => {
    const res = await request(app)
      .get('/api/v1/publicKey');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/-+BEGIN PUBLIC KEY-+\s[-A-Za-z0-9+\n=/]*/);
  });

  test('root create new account with a key', async () => {
    const res = await request(app)
      .post('/api/v1/user/test/key?type=rsa')
      .auth('app', 'app.rootid:secret')
      .accept('application/json');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      auth: { key: expect.stringMatching(/app\..{6}:.{20,}/) },
      key: { private: expect.any(String), public: expect.any(String) }
    });
    await expect(gateway.account('test')).resolves.toBeDefined();
  });

  test('create account with activation code', async () => {
    const activationRes = await request(app)
      .post('/api/v1/user/test/activation')
      .accept('application/json')
      .send({ email: 'test@ex.org' });
    expect(activationRes.status).toBe(200);
    expect(activationRes.body).toMatchObject({ jwe: expect.any(String) });
    const { jwe } = activationRes.body;
    expect(notifier.sendActivationCode).toBeCalledWith(
      'test@ex.org', expect.stringMatching(/\d{6}/));
    const [, code] = notifier.sendActivationCode.mock.lastCall!;
    const res = await request(app)
      .post('/api/v1/user/test/key?type=rsa')
      .auth(jwe, { type: 'bearer' })
      .set('X-Activation-Code', code)
      .accept('application/json');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      auth: { key: expect.stringMatching(/app\..{6}:.{20,}/) },
      key: { private: expect.any(String), public: expect.any(String) }
    });
    await expect(gateway.account('test')).resolves.toBeDefined();
  });

  describe('with user account', () => {
    let userKey: UserKey;
    let acc: Account;

    beforeEach(async () => {
      userKey = UserKey.generate('app.keyid:secret');
      await gateway.domain.write({
        '@id': 'test', '@type': 'Account', key: userKey.toJSON()
      });
      acc = (await gateway.account('test'))!;
    });

    test.todo('account security');

    test('generates a new key', async () => {
      const res = await request(app)
        .post('/api/v1/user/test/key?type=rsa')
        .auth('test', 'app.keyid:secret')
        .accept('application/json');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        auth: { key: expect.stringMatching(/app\..{6}:.{20,}/) },
        key: { private: expect.any(String), public: expect.any(String) }
      });
    });

    test('gets user public key', async () => {
      const res = await request(app)
        .get('/api/v1/user/test/publicKey/keyid')
        .auth('test', 'app.keyid:secret');
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/-+BEGIN PUBLIC KEY-+\s[-A-Za-z0-9+\n=/]*/);
    });

    test('cannot post new uuid subdomain without config', async () => {
      const res = await request(app)
        .post('/api/v1/domain/test')
        .accept('application/json');
      expect(res.status).toBe(405);
    });

    describe('with uuid subdomains', () => {
      beforeEach(async () => {
        const res = await request(app)
          .patch('/api/v1/user/test')
          .auth('test', 'app.keyid:secret')
          .accept('application/json')
          .send({ '@insert': { naming: 'uuid' } });
        expect(res.status).toBe(204);
      });

      test('can post new uuid subdomain config', async () => {
        cloneFactory.reusableConfig.mockResolvedValueOnce({ reusable: true });
        const res = await request(app)
          .post('/api/v1/domain/test')
          .accept('application/json');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          '@domain': expect.stringMatching(/^c[a-z0-9]{24}\.test\.ex\.org/),
          genesis: true, // Definitely new
          reusable: true
        });
      });

      test('can post given uuid subdomain config', async () => {
        cloneFactory.reusableConfig.mockResolvedValueOnce({ reusable: true });
        const name = uuid();
        const res = await request(app)
          .post('/api/v1/domain/test')
          .accept('application/json')
          .send({ name });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          '@domain': `${name}.test.ex.org`,
          genesis: undefined, // Unknown whether new – app's responsibility
          reusable: true
        });
      });

      test('cannot post given name subdomain config without auth', async () => {
        cloneFactory.reusableConfig.mockResolvedValueOnce({ reusable: true });
        const res = await request(app)
          .post('/api/v1/domain/test')
          .accept('application/json')
          .send({ name: 'sd1' });
        expect(res.status).toBe(401);
      });
    });

    test('can post new subdomain', async () => {
      cloneFactory.reusableConfig.mockResolvedValueOnce({ reusable: true });
      const res = await request(app)
        .post('/api/v1/domain/test')
        .auth('test', 'app.keyid:secret')
        .accept('application/json')
        .send({ name: 'sd1' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        '@domain': 'sd1.test.ex.org',
        genesis: false, // Has been backed-up
        reusable: true
      });
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

    describe('puts new subdomain with JWT', () => {
      beforeEach(async () => {
        await acc.update({ '@insert': { remotesAuth: 'jwt' } });
        cloneFactory.reusableConfig.mockImplementation(async (_config, context) => ({
          jwt: await context?.mintJwt?.()
        }));
      });

      test('without user key', async () => {
        const res = await request(app)
          .put('/api/v1/domain/test/sd1')
          .auth('test', 'app.keyid:secret')
          .accept('application/json')
          .send({ user: { '@id': 'http://ex.org/fred' } });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          '@domain': 'sd1.test.ex.org', genesis: false, jwt: anyString()
        });
        expect(decode(res.body.jwt, { json: true })).toMatchObject({
          iss: 'http://ex.org/test', sub: 'http://ex.org/fred'
        });
      });

      test('with user key', async () => {
        const userKey = UserKey.generate('app.keyid:secret');
        const rsaKeyConfig = userKey.getRsaKeyConfig();
        const res = await request(app)
          .put('/api/v1/domain/test/sd1')
          .auth('test', 'app.keyid:secret')
          .accept('application/json')
          .send({
            useSignatures: true,
            user: {
              '@id': 'http://ex.org/fred',
              key: { keyid: 'keyid', public: rsaKeyConfig.public }
            }
          });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
          '@domain': 'sd1.test.ex.org', genesis: false, jwt: anyString()
        });
        const sdc = await gateway.getSubdomain(gateway.ownedId({
          account: 'test', name: 'sd1'
        }));
        expect(sdc?.useSignatures).toBe(true);
        // Note that users inserted into subdomains use the Gateway vocabulary
        await expect(sdc?.state.get('http://ex.org/fred')).resolves.toMatchObject({
          '@id': 'http://ex.org/fred',
          'http://gw.m-ld.org/#key': { '@id': '.keyid' }
        });
        await expect(sdc?.state.get('.keyid')).resolves.toMatchObject({
          'http://gw.m-ld.org/#public': expect.any(Buffer)
        });
      });
    });

    test.todo('puts subdomain with context');

    describe('with subdomain', () => {
      let sdId: AccountOwnedId;
      let clone: MeldClone;

      beforeEach(async () => {
        sdId = gateway.ownedId({ account: 'test', name: 'sd1' });
        await gateway.ensureNamedSubdomain(sdId, { acc, key: { keyid: 'keyid' } });
        clone = cloneFactory.clones[sdId.toDomain()];
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
        const clone = (await gateway.getSubdomain(sdId))!;
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
        const clone = (await gateway.getSubdomain(sdId))!;
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
