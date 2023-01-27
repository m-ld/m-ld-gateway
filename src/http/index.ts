import { createServer, plugins, pre, Server as RestServer } from 'restify';
import LOG from 'loglevel';
import { Gateway, Notifier } from '../server/index.js';
import { formatter, HTML_FORMAT, JSON_LD_FORMAT } from './EndPoint';
import { GatewayEndPoint } from './GatewayEndPoint';
import { SubdomainEndPoint } from './SubdomainEndPoint';
import { SubdomainStateEndPoint } from './SubdomainStateEndPoint';
import { UserEndPoint } from './UserEndPoint';

export class GatewayHttp {
  readonly server: RestServer;

  constructor(gateway: Gateway, notifier?: Notifier) {
    this.server = createServer({
      formatters: {
        'application/ld+json': formatter(JSON_LD_FORMAT),
        'text/html': formatter(HTML_FORMAT)
      }
    });
    this.server.pre(pre.context());
    this.server.use(plugins.queryParser({ mapParams: true }));
    this.server.use(plugins.authorizationParser());
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
    // Set up endpoints
    const gatewayEndPoint = new GatewayEndPoint(gateway, this.server);
    new UserEndPoint(gatewayEndPoint, notifier);
    const subdomainEndPoint = new SubdomainEndPoint(gatewayEndPoint);
    new SubdomainStateEndPoint(subdomainEndPoint);
  }
}