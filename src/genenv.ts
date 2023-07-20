import * as readline from 'readline';
import {
  AccountOwnedId, asLogLevel, Config, DomainKeyStore, Env, resolveDomain
} from './lib/index.js';
import { as } from './lib/validate.js';
import { UserKey } from './data/index.js';

const { stdin: input, stdout: output } = process;
const rl = readline.createInterface({ input, output });
const asInput = as.string().empty('');

async function ask(prompt: string, schema: as.Schema<string> = asInput): Promise<string> {
  const input = await new Promise(resolve =>
    rl.question(`# ${prompt}: `, resolve));
  const { value, error } = schema.validate(input);
  if (error) {
    console.log(error.message);
    return ask(prompt, schema);
  }
  return value;
}

(async function () {
  const gateway = await ask(
    'Gateway domain name or URL',
    as.alt(asInput.domain(), asInput.uri())
  );
  const appId = await ask(
    'Gateway root account',
    AccountOwnedId.asComponentId
  );
  const env = new Env('m-ld-gateway');
  const keyStore = new DomainKeyStore(appId);
  const domainName = resolveDomain(gateway);
  const authKey = (await keyStore.mintKey(domainName)).key;
  const config: Config = {
    gateway,
    ...UserKey.generate(authKey).toConfig(authKey),
    address: {
      host: await ask(
        'Local listen hostname (default auto)',
        asInput.hostname()
      ),
      port: await ask(
        'Local listen port (default 3000)',
        asInput.regex(/\d{,5}/)
      )
    },
    logLevel: await ask(
      'Log level (default INFO)',
      asLogLevel.empty('')
    )
  };
  if ((await ask('Use SMTP?')).startsWith('y')) {
    config.smtp = {
      host: await ask('SMTP host'),
      from: await ask('SMTP from email', asInput.email()),
      auth: {
        user: await ask('SMTP user'),
        pass: await ask('SMTP password')
      }
    };
  }
  rl.close();
  console.log(`# Gateway domain name will be ${domainName}`);
  console.log('# If this is a new Gateway, ' +
    'don\'t forget to use --genesis or M_LD_GATEWAY_GENESIS=true');
  console.log('#'.repeat(100));
  for (let [envVar, envValue] of Object.entries(env.asEnv(config)))
    console.log(`${envVar}=${envValue}`);
})();