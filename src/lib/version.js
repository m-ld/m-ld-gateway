/**
 * This file in Javascript because Typescript will not output the json assertion
 * (given the current tsconfig).
 */

import pkg from '../../package.json' assert { type: 'json' };

const { version } = pkg;
export { version };