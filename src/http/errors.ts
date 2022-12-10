import * as errors from 'restify-errors';

export function toHttpError(e: any) {
  return e instanceof errors.HttpError ?
    e : new InternalServerError(e);
}

export const UnauthorizedError = errors.UnauthorizedError;
export const ForbiddenError = errors.ForbiddenError;
export const ConflictError = errors.ConflictError;
export const BadRequestError = errors.BadRequestError;
export const NotFoundError = errors.NotFoundError;
export const InternalServerError = errors.InternalServerError;