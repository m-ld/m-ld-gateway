import { del, EndPoint, get, HasContext, post, sendChunked, use } from './EndPoint.js';
import { SubdomainEndPoint, SubdomainRequest } from './SubdomainEndPoint.js';
import { SubdomainClone } from '../server/SubdomainClone.js';
import { MethodNotAllowedError, NotFoundError, PreconditionFailedError } from './errors.js';
import { Response } from 'restify';

type SubdomainStateRequest = SubdomainRequest &
  HasContext<'subdomain', SubdomainClone>;

export class SubdomainStateEndPoint extends EndPoint<SubdomainEndPoint> {
  constructor(outer: SubdomainEndPoint) {
    super(outer, '/state');
  }

  @use
  async bindSubdomain(req: SubdomainStateRequest) {
    req.set('subdomain', await this.outer.gateway.getSubdomain(req.get('id')));
  }

  @use
  checkETagMatches(req: SubdomainStateRequest) {
    const mustMatch = req.header('if-match');
    if (mustMatch) {
      const etag = this.outer.etag(req.get('subdomain'));
      if (mustMatch !== etag)
        throw new PreconditionFailedError(
          'if-match "%s" did not match etag "%s"', mustMatch, etag);
    }
  }

  @get
  async getState(req: SubdomainStateRequest, res: Response) {
    const sd = req.get('subdomain');
    res.setHeader('ETag', this.outer.etag(sd));
    if ('query' in req.params || 'q' in req.params) {
      const query = JSON.parse(req.params.query || req.params.q);
      await sendChunked(res, sd.state.read(query).consume);
    } else if ('lock' in req.params) {
      res.send(sd.locked);
    } else {
      throw new MethodNotAllowedError();
    }
  }

  @post
  async setState(req: SubdomainStateRequest, res: Response) {
    const sd = req.get('subdomain');
    const wasLocked = sd.locked;
    await sd.write(req.body);
    res.setHeader('ETag', this.outer.etag(sd));
    if ('lock' in req.params) {
      res.setHeader('Location', this.outer.lockUrl(req));
      res.send(201);
    } else {
      if (!wasLocked) // SubdomainClone always locks on write
        await sd.unlock();
      res.send(200);
    }
  }

  @del
  async deleteState(req: SubdomainStateRequest, res: Response) {
    // Cannot delete the state generally, but can delete a lock
    if ('lock' in req.params) {
      const sd = req.get('subdomain');
      if (sd.locked) {
        await sd.unlock();
        res.send(200);
      } else {
        throw new NotFoundError();
      }
    } else {
      throw new MethodNotAllowedError();
    }
  }
}