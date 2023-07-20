import Joi from 'joi';

export const asReference = Joi.object({
  '@id': Joi.string().required()
});

export const asDateValue = Joi.object({
  '@type': Joi.equal('http://www.w3.org/2001/XMLSchema#dateTime'),
  '@value': Joi.date().iso()
});

export const asUuid = Joi.string().regex(/^c[a-z0-9]{24}$/);

export function isFQDN(address: string) {
  return !Joi.string().domain().validate(address).error;
}

export const asLogLevel = Joi.valid(
  'TRACE', 'trace', 0,
  'DEBUG', 'debug', 1,
  'INFO', 'info', 2,
  'WARN', 'warn', 3,
  'ERROR', 'error', 4,
  'SILENT', 'silent', 5
);

export const validate = Joi.attempt;

export { Joi as as };
