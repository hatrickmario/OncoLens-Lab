import { describe, expect, it } from 'vitest';
describe('x', () => {
  it.runIf(false)('condicional', () => expect(1).toBe(1));
});
