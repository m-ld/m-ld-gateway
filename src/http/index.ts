import * as restify from 'restify';
import { domainRelativeIri, Results, ResultsFormat, ResultsReadable } from '../lib/index.js';
import { gatewayContext } from '../data/index.js';
import { Authorization } from '../server/Authorization.js';
import { pipeline } from 'stream/promises';
import LOG from 'loglevel';
import { BadRequestError, NotFoundError, toHttpError } from './errors.js';
import { Gateway } from '../server/index.js';

const formatter = (format: ResultsFormat): restify.Formatter => {
  return (req, res, body) => {
    const data = `${format.opening || ''}${format.stringify(body)}${format.closing || ''}`;
    res.setHeader('Content-Length', Buffer.byteLength(data));
    return data;
  };
};
const ND_JSON_FORMAT: ResultsFormat = { stringify: JSON.stringify, separator: '\n' };
const JSON_LD_FORMAT: ResultsFormat = {
  stringify: s => JSON.stringify(s, null, ' '),
  separator: ',\n'
};
const HTML_FORMAT: ResultsFormat = {
  stringify: s => JSON.stringify(s, null, ' '),
  opening: '<pre>', closing: '</pre>', separator: '\n'
};

async function sendStream(res: restify.Response, results: Results) {
  res.header('transfer-encoding', 'chunked');
  res.header('content-type', 'application/x-ndjson');
  res.status(200);
  await pipeline(new ResultsReadable(results, ND_JSON_FORMAT), res);
}

type LeafHandler = (req: restify.Request, res: restify.Response) => Promise<void>;

export class GatewayHttp {
  readonly server: restify.Server;

  constructor(
    protected readonly gateway: Gateway
  ) {
    this.server = restify.createServer({
      formatters: {
        'application/ld+json': formatter(JSON_LD_FORMAT),
        'text/html': formatter(HTML_FORMAT)
      }
    });
    this.server.use(restify.plugins.queryParser({ mapParams: true }));
    this.server.use(restify.plugins.authorizationParser());
    this.server.on('InternalServer', function (req, res, err, cb) {
      LOG.warn(err);
      cb();
    });
    if (LOG.getLevel() <= LOG.levels.DEBUG) {
      this.server.pre(function (req, res, next) {
        LOG.info(`${req.method} ${req.url} ${JSON.stringify({
          ...req.headers, authorization: undefined
        })}`);
        return next();
      });
    }

    this.put('/domain/:account/:name', async (req, res) => {
      const id = this.ownedId(req.params);
      const who = await Authorization.fromRequest(req).verifyUser(
        gateway, { id, forWrite: 'Subdomain' });
      res.json(await gateway.subdomainConfig(id, who));
    });

    this.get('/domain/:account/:name/state', async (req, res) => {
      const id = this.ownedId(req.params);
      const query = JSON.parse(req.params.query || req.params.q);
      await Authorization.fromRequest(req).verifyUser(gateway, { id });
      const clone = await this.gateway.initSubdomain(id, false);
      await sendStream(res, clone.read(query).consume);
    });

    this.post('/domain/:account/:name/state', async (req, res) => {
      const id = this.ownedId(req.params);
      await Authorization.fromRequest(req).verifyUser(
        gateway, { id, forWrite: 'Subdomain' });
      const clone = await this.gateway.initSubdomain(id, false);
      await clone.write(req.body);
      res.send(200);
    });

    this.get('/context', async (req, res) => {
      res.contentType = req.accepts('html') ? 'html' : 'application/ld+json';
      res.send({
        '@base': domainRelativeIri('/', gateway.domainName),
        ...gatewayContext // TODO: actual gateway context
      });
    });

    this.get('/publicKey', async (req, res) => {
      if (!gateway.usingUserKeys)
        throw new NotFoundError();
      res.contentType = 'text';
      res.send(gateway.me.userKey!.getCryptoPublicKey().export({
        format: 'pem', type: 'spki'
      }));
    });
  }

  get(route: string, handler: LeafHandler) {
    return this.server.get(this.api(route), this.toHandler(handler));
  }

  post(route: string, handler: LeafHandler) {
    return this.server.post(this.api(route),
      restify.plugins.bodyParser(),
      this.toHandler(handler));
  }

  put(route: string, handler: LeafHandler) {
    return this.server.put(this.api(route),
      restify.plugins.bodyParser(),
      this.toHandler(handler));
  }

  private api(route: string, v = 1) {
    if (!route.startsWith('/'))
      throw new RangeError('Route must start with "/"');
    return `/api/v${v}${route}`;
  }

  private toHandler(handler: LeafHandler): restify.RequestHandlerType {
    return (req, res, next) =>
      handler(req, res).then(next).catch(e => next(toHttpError(e)));
  }

  /**
   * @param account subdomain account (may not be requesting user account)
   * @param name subdomain name
   */
  private ownedId({ account, name }: { account: string, name: string }) {
    try {
      return this.gateway.ownedId(account, name).validate();
    } catch (e) {
      // AccountOwnedId.validate throw strings
      throw new BadRequestError('Bad domain %s/%s', account, name);
    }
  }
}