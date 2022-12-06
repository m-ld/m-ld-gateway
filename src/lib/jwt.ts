import * as jsonwebtoken from 'jsonwebtoken';
import { JwtHeader, Secret, VerifyOptions } from 'jsonwebtoken';

/**
 * Promisified version of jsonwebtoken.verify
 */
export function verifyJwt(
  token: string,
  getSecret: (header: JwtHeader) => Promise<string | Secret>,
  options?: VerifyOptions
) {
  return new Promise((resolve, reject) =>
    jsonwebtoken.verify(token, (header, cb) => {
      getSecret(header).then(secret => cb(null, secret), err => cb(err));
    }, options, (err, payload) => {
      if (err) reject(err);
      else resolve(payload);
    }));
}

export { signJwt } from '@m-ld/io-web-runtime/dist/server/auth';
