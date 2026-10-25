import { describe, expect, it } from 'vitest';
describe('x', () => {
  // eslint-disable-next-line vitest/no-disabled-tests
  it.skip('desactivado', () => expect(1).toBe(1));
});
