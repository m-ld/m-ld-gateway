import { expect } from '@jest/globals';

expect.addEqualityTesters([function (a: unknown, b: unknown) {
  const isABuffer = a instanceof Buffer;
  const isBBuffer = b instanceof Buffer;
  if (isABuffer && isBBuffer)
    return a.equals(b);
  else if (isABuffer !== isBBuffer)
    return false;
}]);