import {
  Formatter, Request, RequestHandler, RequestHandlerType, Response, RouteOptions,
  Server as RestServer
} from 'restify';
import { StringFormat, StringReadable } from '../lib/index.js';
import { toHttpError } from './errors.js';
import { pipeline } from 'stream/promises';
import { Consumable } from 'rx-flowable';
import 'reflect-metadata';

export const stringFormatter = (format?: StringFormat): Formatter => {
  return (_req, res, body) => {
    const data = (format?.opening ?? '') +
      (format?.stringify(body) ?? `${body}`) +
      (format?.closing ?? '');
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
export const PEM_FORMAT: StringFormat = {
  stringify: s => typeof s == 'string' ? s :
    s.export({ format: 'pem', type: 'spki' })
};

export async function sendChunked(res: Response, results: Consumable<any>, status = 200) {
  res.header('transfer-encoding', 'chunked');
  res.header('content-type', 'application/x-ndjson');
  res.status(status);
  await pipeline(new StringReadable(results, ND_JSON_FORMAT), res);
}

type NextFreeHandler = (req: Request, res: Response) => Promise<unknown> | unknown;
function nextifyHandler(handler: NextFreeHandler): RequestHandler {
  return function (this: EndPoint<Routable>, req, res, next) {
    try {
      Promise.resolve(handler.call(this, req, res)).then(next)
        .catch(e => next(toHttpError(e)));
    } catch (e) {
      next(toHttpError(e)); // in case of synchronous error
    }
  };
}

type Verb = 'del' | 'get' | 'head' | 'put' | 'post' | 'patch';
type RouteDef = string | RegExp | RouteOptions;
type Routable = Pick<RestServer, Verb>;

export interface HasContext<K extends string, V> {
  get(key: K): V;
  set(key: K, value: V): void;
}

interface EndPointSetup {
  use(...handlers: RequestHandlerType[]): void;
  useFor(verb: Verb, ...handlers: RequestHandlerType[]): void;
}

// noinspection JSUnusedGlobalSymbols
export class EndPoint<Outer extends Routable> implements Routable {
  del: RestServer['del'];
  get: RestServer['get'];
  head: RestServer['head'];
  put: RestServer['put'];
  post: RestServer['post'];
  patch: RestServer['patch'];

  private useHandlers: RequestHandlerType[] = [];
  private useForHandlers: { [v in Verb]?: RequestHandlerType[] } = {};

  constructor(
    readonly outer: Outer,
    stem: string,
    beforeHandlers?: (setup: EndPointSetup) => void
  ) {
    EndPoint.checkRoute(stem);
    const api = (route: string) => {
      EndPoint.checkRoute(route);
      return `${stem}${route}`;
    };
    for (let verb of ['del', 'get', 'head', 'put', 'post', 'patch'] as Verb[]) {
      this[verb] = (route: string, ...handlers) => outer[verb](
        api(route),
        ...this.useHandlers,
        ...this.useForHandlers[verb] ?? [],
        ...this.nextify(handlers)
      );
    }
    const { use, useFor } = this;
    beforeHandlers?.({ use, useFor });
    for (let [verb, ...args] of getDecoratedHandlers(this))
      this[verb].apply(this, args);
  }

  static checkRoute(route: string) {
    if (route && !route.startsWith('/'))
      throw new RangeError('Route must start with "/"');
  }

  private use = (...handlers: RequestHandlerType[]) => {
    this.useHandlers.push(...this.nextify(handlers));
  };

  private useFor = (verb: Verb, ...handlers: RequestHandlerType[]) => {
    (this.useForHandlers[verb] ??= []).push(...this.nextify(handlers));
  };

  private nextify(handlers: RequestHandlerType[]) {
    return handlers.flat().map(handler => {
      if (handler.length < 3)
        handler = nextifyHandler(<NextFreeHandler>handler);
      return handler.bind(this);
    });
  }
}

const handlersMetadataKey = Symbol('__handlers');
function getDecoratedHandlers(
  target: EndPoint<Routable>
): ([Verb, RouteDef, RequestHandler] | ['use', RequestHandler])[] {
  return Reflect.getMetadata(handlersMetadataKey, target) ?? [];
}

function handlerDecorator(verb: Verb | 'use', opts: RouteDef = '') {
  function use(
    target: EndPoint<Routable>,
    _handlerName: string,
    descriptor: TypedPropertyDescriptor<RequestHandler>
  ): void;
  function use(opts: RouteDef): MethodDecorator;
  function use(
    target: EndPoint<Routable> | RouteDef,
    _handlerName?: string,
    descriptor?: TypedPropertyDescriptor<RequestHandler>
  ): MethodDecorator | void {
    if (target instanceof EndPoint) {
      const handlers = getDecoratedHandlers(target);
      const handler = descriptor!.value!;
      handlers.push(verb === 'use' ? ['use', handler] : [verb, opts, handler]);
      Reflect.defineMetadata(handlersMetadataKey, handlers, target);
    } else {
      return handlerDecorator(verb, target);
    }
  }
  return use;
}

export const use = handlerDecorator('use');
export const del = handlerDecorator('del');
export const get = handlerDecorator('get');
export const head = handlerDecorator('head');
export const put = handlerDecorator('put');
export const post = handlerDecorator('post');
export const patch = handlerDecorator('patch');