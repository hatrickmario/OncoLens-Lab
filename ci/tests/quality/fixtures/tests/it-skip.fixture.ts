import { describe, expect, it } from 'vitest';
describe('x', () => {
  it.skip('desactivado', () => expect(1).toBe(1));
});
