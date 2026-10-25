import { describe, it } from 'vitest';
describe('x', () => {
  it('salta desde el cuerpo', ({ skip }) => skip());
});
