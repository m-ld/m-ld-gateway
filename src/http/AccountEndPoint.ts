import { EndPoint, HasContext } from './EndPoint';
import { GatewayEndPoint, GatewayRequest } from './GatewayEndPoint';
import { Authorization } from '../server/Authorization';
import { ForbiddenError } from './errors';
import { Who } from '../server/Gateway';

export type AccountRequest = GatewayRequest &
  HasContext<'who', Who>;

/**
 * @todo: email activate dance from timeld
 */
export class AccountEndPoint extends EndPoint<GatewayEndPoint> {
  constructor(outer: GatewayEndPoint) {
    super(outer, '/account/:account');

    this.use(async (req: AccountRequest) => {
      req.set('who', await Authorization.fromRequest(req).verifyUser(outer.gateway));
    });

    // Idempotent PUT an account
    this.put('', async (req: AccountRequest, res) => {
      if (req.get('who').acc.name !== outer.gateway.rootAccountName)
        throw new ForbiddenError('Only the gateway root can create an account');
      const account = req.params.account;
      const acc = await outer.gateway.account(account, true);
      if (acc.isNew)
        res.json(201, await acc.generateKey(), { 'Location': `/account/${account}` });
      else
        res.send(204);
    });

    // Account owner can POST a new key for themselves
    this.post('/key', async (req: AccountRequest, res) => {
      const acc = req.get('who').acc;
      if (acc.name !== req.params.account)
        throw new ForbiddenError('Only the account owner can create keys');
      res.json(200, await acc.generateKey());
    });
  }
}