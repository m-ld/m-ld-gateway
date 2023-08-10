import GwCmd from './GwCmd.js';
import HttpCmd, { spec } from './HttpCmd.js';
import { Cmd } from '@m-ld/m-ld-test';
import { fileURLToPath } from 'url';
import { once } from 'events';
import { setTimeout } from 'timers/promises';
import { faker } from '@faker-js/faker/locale/en';
import { createWriteStream } from 'fs';
import path from 'path';
import { SwapiUser } from './SwappUser.js';

Cmd.wd = fileURLToPath(new URL('.', import.meta.url));

////////////////////////////////////////////////////////////////////////////////
// Start the gateway in a child process
const gw = new GwCmd({ clinic: false, logLevel: 'info' });
await gw.start();
const origin = await gw.findByPrefix('listening at ');
const { request } = new HttpCmd(origin);

////////////////////////////////////////////////////////////////////////////////
// Create a user account
const account = faker.internet.domainWord();
const email = faker.internet.email();
const { jwe } =
  await request(spec('accounts/activation'), { account, email });
const activation = await gw.findByPrefix(`code for ${email}: `);
const { auth: { key: accountKey } } =
  await request(spec('accounts/key-using-activation'), { account, jwe, activation });
const digest = Buffer.from(`${account}:${accountKey}`).toString('base64');

////////////////////////////////////////////////////////////////////////////////
// Create a named subdomain
const subdomain = 'sd1';
const config =
  await request(spec('named-subdomains/create'), { account, subdomain, digest });
config.io.uri = origin; // we want the internal URI
config.io.opts.auth.key = accountKey;
config.logLevel = 'DEBUG';

////////////////////////////////////////////////////////////////////////////////
// Start some app instances to write some data
const appStdout = createWriteStream(path.join(gw.dataDir, 'app.log'));
await Promise.all([
  'films', 'people'//, 'planets', 'species', 'starships', 'vehicles'
].map(async resourceType => {
  // Jitter on the app startup
  await setTimeout(faker.number.int({ max: 100 }));
  const user = new SwapiUser(config, resourceType, appStdout);
  await once(user, 'exit');
  console.log(user.cloneId, 'exited');
}));
appStdout.end();

////////////////////////////////////////////////////////////////////////////////
// Read the data
const data = await request(spec('clone-api/async-read'), {
  account, subdomain, digest,
  read: JSON.stringify({
    '@select': '?id',
    '@where': {
      '@id': '?id'
    }
  })
});
console.log(data.map(b => b['?id']));

await gw.cleanup('SIGINT');