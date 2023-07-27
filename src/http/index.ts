import { createServer, plugins, pre, Server as RestServer } from 'restify';
import LOG from 'loglevel';
import { Gateway, Notifier } from '../server/index.js';
import { formatter, HTML_FORMAT, JSON_LD_FORMAT } from './EndPoint.js';
import { ApiEndPoint } from './ApiEndPoint.js';
import { SubdomainEndPoint } from './SubdomainEndPoint.js';
import { SubdomainStateEndPoint } from './SubdomainStateEndPoint.js';
import { UserEndPoint } from './UserEndPoint.js';
import { DomainEndPoint } from './DomainEndPoint.js';
import { GatewayWebsite } from './GatewayWebsite.js';

export function setupGatewayHttp(gateway: Gateway, notifier: Notifier): RestServer {
  const server = createServer({
    formatters: {
      'application/ld+json': formatter(JSON_LD_FORMAT),
      'text/html': formatter(HTML_FORMAT)
    }
  }).pre(pre.context())
    .use(plugins.queryParser({ mapParams: true }))
    .use(plugins.authorizationParser())
    .on('InternalServer', function (_req, _res, err, cb) {
      LOG.warn(err);
      cb();
    });
  if (LOG.getLevel() <= LOG.levels.DEBUG) {
    server.pre(function (req, _res, next) {
      LOG.debug(`${req.method} ${req.url} ${JSON.stringify({
        ...req.headers, authorization: undefined
      })}`);
      return next();
    });
  }
  // Set up endpoints
  new GatewayWebsite(gateway, server, notifier);
  const apiEndPoint = new ApiEndPoint(gateway, server);
  new UserEndPoint(apiEndPoint, notifier);
  new DomainEndPoint(apiEndPoint);
  const subdomainEndPoint = new SubdomainEndPoint(apiEndPoint);
  new SubdomainStateEndPoint(subdomainEndPoint);
  return server;
}