import errors from 'restify-errors';

export function toHttpError(e: any) {
  return e instanceof errors.HttpError ?
    e : new InternalServerError(e);
}

export const UnauthorizedError = errors.UnauthorizedError;
export const MethodNotAllowedError = errors.MethodNotAllowedError;
export const ForbiddenError = errors.ForbiddenError;
export const ConflictError = errors.ConflictError;
export const BadRequestError = errors.BadRequestError;
export const NotFoundError = errors.NotFoundError;
export const PreconditionFailedError = errors.PreconditionFailedError;
export const InternalServerError = errors.InternalServerError;