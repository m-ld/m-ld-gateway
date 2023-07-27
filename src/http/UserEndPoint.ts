import { EndPoint, HasContext, patch, post, use } from './EndPoint.js';
import { ApiEndPoint } from './ApiEndPoint.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from './errors.js';
import { Authorization, Notifier } from '../server/index.js';
import { AccountOwnedId, as, validate } from '../lib/index.js';
import { Request, Response } from 'restify';

export type UserRequest = Request & HasContext<'user', string>;

export class UserEndPoint extends EndPoint<ApiEndPoint> {
  constructor(outer: ApiEndPoint, private notifier: Notifier) {
    super(outer, '/user/:user');
  }

  get gateway() {
    return this.outer.gateway;
  }

  @use
  bindUser(req: UserRequest) {
    const { user } = req.params;
    if (!AccountOwnedId.isComponentId(user))
      throw new NotFoundError;
    req.set('user', user);
  }

  /**
   * Root can create an account with a key.
   * User can get a new key for themselves.
   */
  @post('/key')
  async getKey(req: UserRequest, res: Response) {
    const { type } = req.params;
    validate(type, as.equal('rsa').optional());
    // A key request could be using an activation code
    const code = req.header('x-activation-code');
    if (code) {
      if (req.authorization) {
        const jwe = req.authorization.credentials;
        const { user, email } = this.gateway.verifyActivation(code, jwe);
        if (user !== req.get('user'))
          throw new UnauthorizedError('User does not match activation');
        const acc = await this.gateway.account(user, true);
        const config = await acc.generateKey({ email, type });
        res.json(200, config);
      } else {
        throw new UnauthorizedError('Missing bearer token');
      }
    } else {
      const acc = await this.getAuthorisedAccount(req, true);
      res.json(200, await acc.generateKey({ type }));
    }
  }

  // TODO: This needs to be secured against denial-of-service
  @post('/activation')
  async getActivation(req: UserRequest, res: Response) {
    const { email } = req.body;
    validate(email, as.string().email().required());
    const { jwe, code } = await this.gateway.activation(req.get('user'), email);
    await this.notifier.sendActivationCode(email, code);
    res.json(200, { jwe });
  }

  @patch
  async updateDetails(req: UserRequest, res: Response) {
    const acc = await this.getAuthorisedAccount(req, false);
    await acc.update(req.body);
    res.send(204);
  }

  private async getAuthorisedAccount(req: UserRequest, orCreate: boolean) {
    const who = await Authorization.fromRequest(req).verifyUser(this.gateway);
    const acc = who.acc.name === req.get('user') ? who.acc :
      // The root account is allowed to access user accounts
      who.acc.name === this.gateway.rootAccountName ?
        await this.gateway.account(req.get('user'), orCreate) : null;
    if (acc == null)
      throw new ForbiddenError;
    return acc;
  }
}