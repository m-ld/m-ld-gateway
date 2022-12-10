import { Server as SocketIoServer } from 'socket.io';
import { IoRemotesService } from '@m-ld/m-ld/ext/socket.io/server';
import { Authorization } from '../server/Authorization';
import { AccountOwnedId } from '../lib';
import { ForbiddenError } from '../http/errors';
import { Server as RestifyServer } from 'restify';
import LOG from 'loglevel';
import { Gateway } from '../server/index';

export class IoService extends IoRemotesService {
  constructor(gateway: Gateway, server: RestifyServer) {
    const io = new SocketIoServer(server.server);
    super(io.sockets);
    // Attach authorisation
    io.use(async (socket, next) => {
      const { user, key } = socket.handshake.auth;
      const { '@domain': domainName } = socket.handshake.query;
      try {
        if (user) {
          if (typeof domainName == 'string') {
            // A user is trying to access a given domain
            await new Authorization({ user, key }).verifyUser(gateway, {
              id: AccountOwnedId.fromDomain(domainName), forWrite: 'Subdomain'
            });
          } else {
            return next(new ForbiddenError('Domain not specified'));
          }
        } else if (key !== gateway.me.authKey.toString()) {
          // The gateway is connecting to a domain: its own, or a subdomain
          return next(new ForbiddenError('Unrecognised machine key'));
        }
        LOG.debug('IO authorised for', user, 'in', domainName);
        return next();
      } catch (e) {
        LOG.error('IO authorisation failed for', user, 'in', domainName, e);
        return next(e);
      }
    });
  }
}