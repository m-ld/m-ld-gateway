/**
 * @param {string|number} value
 * @returns {import('jtd').Schema}
 */
export const mustBe = (value: string | number) => ({ enum: [value] });

/**
 * @type {import('jtd').Schema}
 */
export const isReference = { properties: { '@id': { type: 'string' } } };

/**
 * @type {import('jtd').Schema}
 */
export const isDate = {
  properties: {
    '@type': mustBe('http://www.w3.org/2001/XMLSchema#dateTime'),
    '@value': { type: 'timestamp' }
  }
};

/**
 * Shorthand for description metadata
 * @param {string} doc
 * @returns {{ metadata: { description: string } }}
 */
export const withDoc = (doc: string) => ({
  metadata: { description: doc }
});
