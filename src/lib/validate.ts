import Joi from 'joi';

export const referenceSchema = Joi.object({
  '@id': Joi.string().required()
});

export const dateValueSchema = Joi.object({
  '@type': Joi.equal('http://www.w3.org/2001/XMLSchema#dateTime'),
  '@value': Joi.date().iso()
});

export function isFQDN(address: string) {
  return !Joi.string().domain().validate(address).error;
}

export const validate = Joi.attempt;

export { Joi as as };
