import { AuthKey, GatewayApp, GatewayPrincipal, UserKey } from '../src/index.js';

describe('Gateway App', () => {
  test('construct', () => {
    const userKey = UserKey.generate('app.keyid:secret');
    const accessConfig = userKey.toConfig(AuthKey.fromString('app.keyid:secret'));
    const app = new GatewayApp('ex.org',
      new GatewayPrincipal('http://ex.org/test', accessConfig));
    expect(app.principal!['@id']).toBe('http://ex.org/test');
    // noinspection JSCheckFunctionSignatures unused state parameter on sign
    expect(app.transportSecurity!.sign!(Buffer.from('hello'), null))
      .toMatchObject({
        pid: 'http://ex.org/test',
        sig: expect.any(Buffer)
      });
  });
});