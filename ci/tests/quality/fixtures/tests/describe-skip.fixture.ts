import { describe, expect, it } from 'vitest';
describe.skip('x', () => {
  it('dentro', () => expect(1).toBe(1));
});
