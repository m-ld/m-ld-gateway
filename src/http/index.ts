import * as restify from 'restify';
import { domainRelativeIri, Results, ResultsFormat, ResultsReadable } from '../lib';
import { gatewayContext } from '../data';
import { Authorization } from '../server/Authorization';
import { pipeline } from 'stream/promises';
import LOG from 'loglevel';
import { BadRequestError, NotFoundError, toHttpError } from './errors';
import { Gateway } from '../server/index';

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

export class GatewayHttp {
  public readonly server: restify.Server;

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

    this.server.get('/api/config/:account/domain/:name',
      async (req, res, next) => {
        // account is the subdomain account (may not be user account)
        const { account, name } = req.params;
        try {
          const id = gateway.ownedId(account, name).validate();
          try {
            const who = await Authorization.fromRequest(req).verifyUser(
              gateway, { id, forWrite: 'Subdomain' });
            res.json(await gateway.subdomainConfig(id, who));
          } catch (e) {
            next(toHttpError(e));
          }
          next();
        } catch (e) {
          // TimesheetId.validate throw strings
          return next(new BadRequestError(
            'Bad timesheet %s/%s', account, name));
        }
      });

    this.server.post('/api/read', restify.plugins.bodyParser(),
      async (req, res, next) => {
        try {
          const { acc } = await Authorization.fromRequest(req).verifyUser(gateway);
          await sendStream(res, await acc.read(req.body));
          next();
        } catch (e) {
          next(toHttpError(e));
        }
      });

    this.server.post('/api/read/:account/domain/:name', restify.plugins.bodyParser(),
      async (req, res, next) => {
        // account is the subdomain account (may not be user account)
        const { account, name } = req.params;
        try {
          const id = gateway.ownedId(account, name).validate();
          const { acc } = await Authorization.fromRequest(req).verifyUser(
            gateway, { id });
          await sendStream(res, await acc.read(req.body, id));
          next();
        } catch (e) {
          next(toHttpError(e));
        }
      });

    this.server.post('/api/write', restify.plugins.bodyParser(),
      async (req, res, next) => {
        try {
          const { acc } = await Authorization.fromRequest(req).verifyUser(gateway);
          await acc.write(req.body);
          res.send(200);
          next();
        } catch (e) {
          next(toHttpError(e));
        }
      });

    this.server.post('/api/write/:account/domain/:name', restify.plugins.bodyParser(),
      async (req, res, next) => {
        // account is the subdomain account (may not be user account)
        const { account, name } = req.params;
        try {
          const id = gateway.ownedId(account, name).validate();
          const { acc } = await Authorization.fromRequest(req).verifyUser(
            gateway, { id, forWrite: 'Subdomain' });
          await acc.write(req.body, id);
          res.send(200);
          next();
        } catch (e) {
          next(toHttpError(e));
        }
      });

    this.server.get('/context',
      async (req, res, next) => {
        res.contentType = req.accepts('html') ? 'html' : 'application/ld+json';
        // noinspection HttpUrlsUsage
        res.send({
          '@base': domainRelativeIri('/', gateway.domainName),
          ...gatewayContext
        });
        next();
      });

    this.server.get('/publicKey',
      async (req, res, next) => {
        if (gateway.usingUserKeys) {
          res.contentType = 'text';
          res.send(gateway.me.userKey!.getCryptoPublicKey().export({
            format: 'pem', type: 'spki'
          }));
          next();
        } else {
          next(new NotFoundError());
        }
      });
  }
}