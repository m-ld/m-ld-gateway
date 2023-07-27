import { EndPoint, post } from './EndPoint.js';
import { plugins, Request, Response, Server } from 'restify';
import { Gateway, Notifier } from '../server/index.js';
import { fileURLToPath } from 'url';
import { AccountOwnedId, validate } from '../lib/index.js';
import { as } from '../lib/validate.js';
import { Liquid } from 'liquidjs';
import { pipeline } from 'stream/promises';
import { toHttpError } from './errors.js';

/** Directory of the m-ld-gateway package */
const siteDir = fileURLToPath(new URL('../../_site/', import.meta.url));

export class GatewayWebsite extends EndPoint<Server> {
  private liquid = new Liquid({ root: siteDir });

  constructor(
    readonly gateway: Gateway,
    server: Server,
    private notifier: Notifier
  ) {
    super(server, '', ({ useFor }) =>
      useFor('post', plugins.bodyParser()));
    server.get('/*', plugins.serveStatic({
      directory: siteDir, default: 'index'
    }));
  }

  @post('/activate')
  async activation(req: Request, res: Response) {
    const { account, email, code, jwe } = req.body;
    let pageVars: {};
    try {
      if (email) {
        AccountOwnedId.checkComponentId(account);
        // Requesting activation code by email
        validate(email, as.string().email());
        const { jwe, code } = await this.gateway.activation(account, email);
        await this.notifier.sendActivationCode(email, code);
        pageVars = { account, email, jwe };
      } else {
        const { user: account, email } = this.gateway.verifyActivation(code, jwe);
        const acc = await this.gateway.account(account, true);
        const { auth: { key } } = await acc.generateKey({ email });
        pageVars = { account, email, key };
      }
    } catch (e) {
      pageVars = { account, email, error: toHttpError(e).toJSON() };
    }
    const html = await this.liquid.renderFileToNodeStream('activate', pageVars);
    res.header('transfer-encoding', 'chunked');
    await pipeline(html, res);
  }
}