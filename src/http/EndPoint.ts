import { Formatter, Request, RequestHandlerType, Response, Server as RestServer } from 'restify';
import { StringFormat, StringReadable } from '../lib/index.js';
import { toHttpError } from './errors.js';
import { pipeline } from 'stream/promises';
import { Consumable } from 'rx-flowable';

export const formatter = (format: StringFormat): Formatter => {
  return (req, res, body) => {
    const data = `${format.opening || ''}${format.stringify(body)}${format.closing || ''}`;
    res.setHeader('Content-Length', Buffer.byteLength(data));
    return data;
  };
};
const ND_JSON_FORMAT: StringFormat = { stringify: JSON.stringify, separator: '\n' };
export const JSON_LD_FORMAT: StringFormat = {
  stringify: s => JSON.stringify(s, null, ' '),
  separator: ',\n'
};
export const HTML_FORMAT: StringFormat = {
  stringify: s => JSON.stringify(s, null, ' '),
  opening: '<pre>', closing: '</pre>', separator: '\n'
};

export async function sendChunked(res: Response, results: Consumable<any>, status = 200) {
  res.header('transfer-encoding', 'chunked');
  res.header('content-type', 'application/x-ndjson');
  res.status(status);
  await pipeline(new StringReadable(results, ND_JSON_FORMAT), res);
}

type NextFreeHandler = (req: Request, res: Response) => Promise<unknown> | unknown;
function nextifyHandler(handler: NextFreeHandler): RequestHandlerType {
  return (req, res, next) => {
    try {
      Promise.resolve(handler(req, res)).then(next)
        .catch(e => next(toHttpError(e)));
    } catch (e) {
      next(toHttpError(e)); // in case of synchronous error
    }
  };
}
function nextify(handlers: RequestHandlerType[]) {
  return handlers.map(handler => {
    if (typeof handler == 'function' && handler.length < 3)
      return nextifyHandler(<NextFreeHandler>handler);
    return handler;
  });
}

type Verb = 'del' | 'get' | 'put' | 'post';
type Routable = Pick<RestServer, Verb>;

export interface HasContext<K extends string, V> {
  get(key: K): V;
  set(key: K, value: V): void;
}

export class EndPoint<Outer extends Routable> implements Routable {
  del: RestServer['del'];
  get: RestServer['get'];
  put: RestServer['put'];
  post: RestServer['post'];

  private useHandlers: RequestHandlerType[] = [];
  private useForHandlers: { [v in Verb]?: RequestHandlerType[] } = {};

  constructor(
    readonly outer: Outer,
    stem: string
  ) {
    EndPoint.checkRoute(stem);
    const api = (route: string) => {
      EndPoint.checkRoute(route);
      return `${stem}${route}`;
    };
    for (let verb of ['del', 'get', 'put', 'post'] as Verb[]) {
      this[verb] = (route: string, ...handlers) => outer[verb](
        api(route),
        ...this.useHandlers,
        ...this.useForHandlers[verb] ?? [],
        ...nextify(handlers)
      );
    }
  }

  static checkRoute(route: string) {
    if (route && !route.startsWith('/'))
      throw new RangeError('Route must start with "/"');
  }

  use(...handlers: RequestHandlerType[]) {
    this.useHandlers.push(...nextify(handlers));
  }

  useFor(verb: Verb, ...handlers: RequestHandlerType[]) {
    (this.useForHandlers[verb] ??= []).push(...nextify(handlers));
  }
}