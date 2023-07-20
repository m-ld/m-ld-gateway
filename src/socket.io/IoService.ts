import { Server as SocketIoServer } from 'socket.io';
import { IoRemotesService } from '@m-ld/m-ld/ext/socket.io-server';
import { JwtAuthorization, KeyAuthorization } from '../server/Authorization.js';
import { AccountOwnedId, as, asUuid, validate } from '../lib/index.js';
import {
  BadRequestError, ForbiddenError, InternalServerError, toHttpError
} from '../http/errors.js';
import LOG from 'loglevel';
import { Account, Gateway } from '../server/index.js';
import type { Server } from 'http';

const asHandshakeAuth = as.object({
  user: AccountOwnedId.asComponentId.optional(),
  key: as.string(),
  jwt: as.string()
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
        const { user, key, jwt } = validate(socket.handshake.auth, asHandshakeAuth);
        const { '@domain': domainName } = validate(socket.handshake.query, asHandshakeQuery);
        if (!domainName.endsWith(gateway.domainName))
          return next(new BadRequestError('Bad gateway'));
        // The gateway is connecting to a domain: its own, or a subdomain
        if (key === gateway.me.authKey.toString())
          return next();

        const sdId = AccountOwnedId.fromDomain(domainName).validate();
        const access = { id: sdId, forWrite: 'Subdomain' };
        const remotesAuth = await Account.getDetails(
          gateway.domain, sdId.account, 'remotesAuth');
        if (!user && !key && !jwt) {
          validate(sdId.name, asUuid); // Anonymous messaging requires UUID subdomain
          if (!remotesAuth.includes('anon'))
            return next(new ForbiddenError('Anonymous messaging unavailable'));
        } else if (user && key) {
          // key authentication is the default if nothing else is specified
          if (remotesAuth.length && !remotesAuth.includes('key'))
            return next(new ForbiddenError('Key-authenticated messaging unavailable'));
          await new KeyAuthorization(user, key).verifyUser(gateway, access);
        } else if (jwt) {
          if (!remotesAuth.includes('jwt'))
            return next(new ForbiddenError('JWT-authenticated messaging unavailable'));
          await new JwtAuthorization(jwt).verifyUser(gateway, access);
        } else {
          return next(new ForbiddenError('Unrecognised authentication'));
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