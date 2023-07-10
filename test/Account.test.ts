import { clone as meldClone, uuid } from '@m-ld/m-ld';
import { MemoryLevel } from 'memory-level';
import { DeadRemotes } from './fixtures.js';
import { AccountOwnedId, AuthKey, AuthKeyStore, gatewayContext, UserKey } from '../src';
import { Account } from '../src/server/index.js';
import { mock, MockProxy } from 'jest-mock-extended';
import { UserKeyConfig } from '../src/data/UserKey';
import { AccountContext } from '../src/server/Account';

describe('Gateway account', () => {
  let gateway: MockProxy<AccountContext>;
  let keyStore: MockProxy<AuthKeyStore>;
  let userKey: UserKey;

  beforeAll(() => {
    userKey = UserKey.generate('appid.keyid:secret');
  });

  const keyDetails = (revoked = false) => ({
    key: AuthKey.fromString('appid.keyid:secret'),
    name: 'test@ex.org',
    revoked
  });

  beforeEach(async () => {
    const config = {
      '@id': uuid(),
      '@domain': 'ex.org',
      '@context': gatewayContext,
      genesis: true
    };
    // noinspection JSCheckFunctionSignatures
    const domain = await meldClone(new MemoryLevel(), DeadRemotes, config);
    keyStore = mock<AuthKeyStore>();
    gateway = Object.assign(mock<AccountContext>(), {
      domainName: 'ex.org', keyStore, domain
    });
  });

  test('to & from JSON', () => {
    const acc = new Account(gateway, {
      name: 'test',
      emails: ['test@ex.org'],
      keyids: ['keyid'],
      admins: ['user1'],
      subdomains: [{ '@id': 'test/ts1' }]
    });
    expect(acc.name).toBe('test');
    expect(acc.emails).toEqual(new Set(['test@ex.org']));
    expect(acc.keyids).toEqual(new Set(['keyid']));
    expect(acc.admins).toEqual(new Set(['user1']));
    expect(acc.subdomains).toEqual([{ '@id': 'test/ts1' }]);
    expect(acc.toJSON()).toEqual({
      '@id': 'test',
      '@type': 'Account',
      email: ['test@ex.org'],
      'vf:primaryAccountable': [{ '@id': 'user1' }],
      key: [{ '@id': '.keyid' }],
      subdomain: [{ '@id': 'test/ts1' }]
    });
  });

  test('activate', async () => {
    const acc = new Account(gateway, { name: 'test' });
    await gateway.domain.write(acc.toJSON());
    keyStore.mintKey.mockImplementation(name => Promise.resolve({
      key: AuthKey.fromString('appid.keyid:secret'), name, revoked: false
    }));
    const keyConfig = <UserKeyConfig>await acc.generateKey('test@ex.org');
    expect(gateway.keyStore.mintKey).toBeCalledWith('test@ex.org');
    expect(acc.emails).toEqual(new Set(['test@ex.org']));
    expect(acc.keyids).toEqual(new Set(['keyid']));
    expect(keyConfig.auth.key).toBe('appid.keyid:secret');
    await expect(gateway.domain.get('test')).resolves.toEqual({
      '@id': 'test',
      '@type': 'Account',
      email: 'test@ex.org',
      key: { '@id': '.keyid' }
    });
    await expect(gateway.domain.get('.keyid')).resolves.toEqual({
      '@id': '.keyid',
      '@type': 'UserKey',
      public: Buffer.from(keyConfig.key.public, 'base64'),
      private: Buffer.from(keyConfig.key.private!, 'base64'),
      revoked: false
    });
  });

  test('authorise user for no particular owned object', async () => {
    await gateway.domain.write({
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    });
    const acc = Account.fromJSON(gateway, (await gateway.domain.get('test'))!);
    keyStore.pingKey.mockImplementation(async (keyid, getAuthorisedTsIds) => {
      await expect(getAuthorisedTsIds!()).resolves.toEqual([]);
      return keyDetails();
    });
    await expect(acc.authorise('keyid')).resolves.toMatchObject({});
    expect(gateway.keyStore.pingKey).toBeCalledWith('keyid', expect.any(Function));
  });

  test('authorise new subdomain in user account', async () => {
    await gateway.domain.write({
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    });
    const acc = Account.fromJSON(gateway, (await gateway.domain.get('test'))!);
    keyStore.pingKey.mockImplementation(async (keyid, getAuthorisedTsIds) => {
      await expect(getAuthorisedTsIds!()).resolves.toEqual(
        [AccountOwnedId.fromString('test/ts1@ex.org')]);
      return keyDetails();
    });
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: 'Subdomain'
    })).resolves.toMatchObject({});
    expect(gateway.keyStore.pingKey).toBeCalledWith('keyid', expect.any(Function));
  });

  test('authorise existing subdomain in user account', async () => {
    await gateway.domain.write({
      '@id': 'test', '@type': 'Account', key: userKey.toJSON(),
      subdomain: [
        { '@id': 'test/ts1', '@type': 'Subdomain' },
        { '@id': 'test/ts2', '@type': 'Subdomain' }
      ]
    });
    const acc = Account.fromJSON(gateway, (await gateway.domain.get('test'))!);
    keyStore.pingKey.mockImplementation(async (keyid, getAuthorisedTsIds) => {
      await expect(getAuthorisedTsIds!()).resolves.toEqual([
        AccountOwnedId.fromString('test/ts1@ex.org'),
        AccountOwnedId.fromString('test/ts2@ex.org')
      ]);
      return keyDetails();
    });
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: 'Subdomain'
    })).resolves.toMatchObject({});
    expect(gateway.keyStore.pingKey).toBeCalledWith('keyid', expect.any(Function));
  });

  test('authorise new subdomain in organisation account', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'test' }
    }]);
    const acc = Account.fromJSON(gateway, (await gateway.domain.get('test'))!);
    keyStore.pingKey.mockImplementation(async (keyid, getAuthorisedTsIds) => {
      await expect(getAuthorisedTsIds!()).resolves.toEqual([
        AccountOwnedId.fromString('org1/ts1@ex.org')
      ]);
      return keyDetails();
    });
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: 'Subdomain'
    })).resolves.toMatchObject({});
    expect(gateway.keyStore.pingKey).toBeCalledWith('keyid', expect.any(Function));
  });

  test('authorise existing subdomain in organisation account', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON(),
      subdomain: { '@id': 'test/ts1', '@type': 'Subdomain' }
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'test' },
      subdomain: { '@id': 'org1/ts1', '@type': 'Subdomain' }
    }]);
    const acc = Account.fromJSON(gateway, (await gateway.domain.get('test'))!);
    keyStore.pingKey.mockImplementation(async (keyid, getAuthorisedTsIds) => {
      await expect(getAuthorisedTsIds!()).resolves.toEqual([
        AccountOwnedId.fromString('test/ts1@ex.org'),
        AccountOwnedId.fromString('org1/ts1@ex.org')
      ]);
      return keyDetails();
    });
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: 'Subdomain'
    })).resolves.toMatchObject({});
    expect(gateway.keyStore.pingKey).toBeCalledWith('keyid', expect.any(Function));
  });

  test('unauthorised if not an organisation admin', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'fred' },
      subdomain: { '@id': 'org1/ts1', '@type': 'Subdomain' }
    }]);
    const acc = Account.fromJSON(gateway, (await gateway.domain.get('test'))!);
    keyStore.pingKey.mockImplementation(() => Promise.resolve(keyDetails()));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: 'Subdomain'
    })).rejects.toThrowError();
  });

  test('unauthorised for create if not an organisation admin', async () => {
    await gateway.domain.write([{
      '@id': 'test', '@type': 'Account', key: userKey.toJSON()
    }, {
      '@id': 'org1', '@type': 'Account', 'vf:primaryAccountable': { '@id': 'fred' }
    }]);
    const acc = Account.fromJSON(gateway, (await gateway.domain.get('test'))!);
    keyStore.pingKey.mockImplementation(() => Promise.resolve(keyDetails()));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('org1/ts1@ex.org'), forWrite: 'Subdomain'
    })).rejects.toThrowError();
  });

  test('unauthorised if not registered keyid', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: [], subdomains: [{ '@id': 'test/ts1' }]
    });
    keyStore.pingKey.mockImplementation(() => Promise.resolve(keyDetails()));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: 'Subdomain'
    })).rejects.toThrowError();
  });

  test('unauthorised if key store has no keyid', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: ['keyid'], subdomains: [{ '@id': 'test/ts1' }]
    });
    keyStore.pingKey.mockImplementation(() => Promise.reject('Not Found'));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: 'Subdomain'
    })).rejects.toThrowError();
  });

  test('unauthorised if key revoked', async () => {
    const acc = new Account(gateway, {
      name: 'test', keyids: ['keyid'], subdomains: [{ '@id': 'test/ts1' }]
    });
    keyStore.pingKey.mockImplementation(() => Promise.resolve(keyDetails(true)));
    await expect(acc.authorise('keyid', {
      id: AccountOwnedId.fromString('test/ts1@ex.org'), forWrite: 'Subdomain'
    })).rejects.toThrowError();
  });
});