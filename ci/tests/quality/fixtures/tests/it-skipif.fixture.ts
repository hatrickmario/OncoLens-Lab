import { describe, expect, it } from 'vitest';
describe('x', () => {
  it.skipIf(true)('condicional', () => expect(1).toBe(1));
});
