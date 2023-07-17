import { Server as SocketIoServer } from 'socket.io';
import { IoRemotesService } from '@m-ld/m-ld/ext/socket.io-server';
import { BasicAuthorization } from '../server/Authorization.js';
import { AccountOwnedId, as, validate } from '../lib/index.js';
import {
  BadRequestError, ForbiddenError, InternalServerError, toHttpError
} from '../http/errors.js';
import LOG from 'loglevel';
import { Account, Gateway } from '../server/index.js';
import type { Server } from 'http';

const asHandshakeAuth = as.object({
  user: AccountOwnedId.asComponentId.optional(),
  key: as.string()
});
const asHandshakeQuery = as.object({
  '@domain': as.string().domain().required()
}).unknown();

export class IoService extends IoRemotesService {
  constructor(gateway: Gateway, server: Server) {
    const io = new SocketIoServer(server);
    super(io.sockets);
    // Attach authorisation
    io.use(async (socket, next) => {
      try {
        const { user, key } = validate(socket.handshake.auth, asHandshakeAuth);
        const { '@domain': domainName } = validate(socket.handshake.query, asHandshakeQuery);
        if (!domainName.endsWith(gateway.domainName))
          return next(new BadRequestError('Bad gateway'));
        // The gateway is connecting to a domain: its own, or a subdomain
        if (key === gateway.me.authKey.toString())
          return next();
        const ownedId = AccountOwnedId.fromDomain(domainName).validate();
        const access = { id: ownedId, forWrite: 'Subdomain' };
        if (!user && !key) {
          if (!await Account.hasAnonymousAccess(gateway, access.id))
            return next(new ForbiddenError('Anonymous messaging not available'));
        } else if (user) {
          await new BasicAuthorization(user, key).verifyUser(gateway, access);
        } else {
          return next(new ForbiddenError('Unrecognised key'));
        }
        LOG.debug('IO authorised for', user || 'anonymous', 'in', domainName);
        return next();
      } catch (e) {
        const httpError = toHttpError(e);
        if (httpError instanceof InternalServerError)
          LOG.error('IO authorisation failed for', socket.handshake, e);
        return next(httpError);
      }
    });
  }
}