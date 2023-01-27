import { EndPoint, HasContext } from './EndPoint';
import { GatewayEndPoint, GatewayRequest } from './GatewayEndPoint';
import { ForbiddenError, NotFoundError, UnauthorizedError } from './errors';
import { Authorization, Notifier } from '../server/index.js';
import { AccountOwnedId } from '../lib/index';

export type UserRequest = GatewayRequest & HasContext<'user', string>;

export class UserEndPoint extends EndPoint<GatewayEndPoint> {
  constructor(outer: GatewayEndPoint, notifier?: Notifier) {
    super(outer, '/user/:user');

    this.use((req: UserRequest) => {
      const { user } = req.params;
      if (!AccountOwnedId.isComponentId(user))
        throw new NotFoundError();
      req.set('user', user);
    });

    /**
     * Root can create an account with a key.
     * User can get a new key for themselves.
     */
    this.post('/key', async (req: UserRequest, res) => {
      // A key request could be using an activation code
      const code = req.header('x-activation-code');
      if (code) {
        if (req.authorization) {
          const { user, email } =
            outer.gateway.verifyActivation(code, req.authorization.credentials);
          if (user !== req.get('user'))
            throw new UnauthorizedError('User does not match activation');
          const acc = await outer.gateway.account(user, true);
          res.json(200, await acc.generateKey(email));
        } else {
          throw new UnauthorizedError('Missing bearer token');
        }
      } else {
        const who = await Authorization.fromRequest(req).verifyUser(outer.gateway);
        const acc = who.acc.name === req.get('user') ? who.acc :
          who.acc.name === outer.gateway.rootAccountName ?
            await outer.gateway.account(req.get('user'), true) : null;
        if (acc == null)
          throw new ForbiddenError('Only the account owner can create keys');
        res.json(200, await acc.generateKey());
      }
    });

    if (notifier != null) {
      // TODO: This needs to be secured against denial-of-service
      this.post('/activation', async (req: UserRequest, res) => {
        const { email } = req.body;
        const { jwe, code } = await outer.gateway.activation(req.get('user'), email);
        await notifier.sendActivationCode(email, code);
        res.json(200, { jwe });
      });
    }
  }
}