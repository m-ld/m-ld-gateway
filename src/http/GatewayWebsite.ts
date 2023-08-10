import { EndPoint, get, head, post } from './EndPoint.js';
import { plugins, Request, Response, Server } from 'restify';
import { AccountOwnedId, resolveGateway, validate } from '../lib/index.js';
import { as } from '../lib/validate.js';
import { pipeline } from 'stream/promises';
import { MethodNotAllowedError, toHttpError } from './errors.js';
import type { Gateway, Notifier } from '../server/index.js';
import type { Liquid } from 'liquidjs';
import { version } from '../lib/version.js';

type PageVars = Record<string, string>;

export class GatewayWebsite extends EndPoint<Server> {
  private readonly pageVars: Promise<PageVars>;
  private readonly startTime = new Date();

  constructor(
    readonly gateway: Gateway,
    server: Server,
    private readonly notifier: Notifier,
    private readonly liquid: Liquid
  ) {
    super(server, '', ({ useFor }) =>
      useFor('post', plugins.bodyParser()));
    this.pageVars = Promise.resolve(resolveGateway(gateway.config.gateway)).then(url => ({
      origin: url.origin,
      domain: gateway.domainName,
      root: gateway.rootAccountName,
      version
    }));
  }

  @get('/*')
  async getPage(req: Request, res: Response) {
    if (req.path() === '/activate')
      throw new MethodNotAllowedError;
    await this.renderHtml(res, req.path().slice(1) || 'index', await this.pageVars);
  }

  @head('/*')
  async headPage(req: Request, res: Response) {
    if (req.path() === '/activate')
      throw new MethodNotAllowedError;
    // This will throw ENOENT if not found
    await this.liquid.parseFile(req.path().slice(1) || 'index');
    this.setHtmlHeaders(res).send();
  }

  @post('/activate')
  async activation(req: Request, res: Response) {
    const { account, email, code, jwe } = req.body;
    const pageVars: PageVars = { account, email, version };
    try {
      if (email) {
        AccountOwnedId.checkComponentId(account);
        // Requesting activation code by email
        validate(email, as.string().email());
        const { jwe, code } = await this.gateway.activation(account, email);
        await this.notifier.sendActivationCode(email, code);
        pageVars.jwe = jwe;
      } else {
        const { user: account, email } = this.gateway.verifyActivation(code, jwe);
        const acc = await this.gateway.account(account, true);
        const { auth: { key } } = await acc.generateKey({ email });
        pageVars.key = key;
      }
    } catch (e) {
      pageVars.error = toHttpError(e).toJSON();
    }
    await this.renderHtml(res, 'activate', pageVars);
  }

  private async renderHtml(res: Response, file: string, pageVars: PageVars) {
    // This will throw ENOENT if not found
    const html = await this.liquid.renderFileToNodeStream(file, pageVars);
    await pipeline(html, this.setHtmlHeaders(res));
  }

  private setHtmlHeaders(res: Response) {
    res.header('content-type', 'text/html');
    res.header('transfer-encoding', 'chunked');
    res.header('last-modified', this.startTime);
    return res;
  }
}