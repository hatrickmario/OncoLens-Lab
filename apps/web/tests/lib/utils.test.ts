import { describe, expect, it } from 'vitest';
import { cn } from '../../lib/utils';

describe('cn', () => {
  it('conserva solo el último radio cuando se combinan radios de los tokens propios [ARR-02 AC-3]', () => {
    expect(cn('rounded-control border', 'rounded-tarjeta')).toBe('border rounded-tarjeta');
    expect(cn('rounded-tarjeta', 'rounded-dialogo')).toBe('rounded-dialogo');
  });

  it('conserva solo la última sombra cuando se combina la sombra propia con una estándar [ARR-02 AC-3]', () => {
    expect(cn('shadow-dialogo', 'shadow-md')).toBe('shadow-md');
    expect(cn('shadow-md', 'shadow-dialogo')).toBe('shadow-dialogo');
  });

  it('une clases condicionales y descarta los valores falsos', () => {
    expect(cn('p-4', false && 'hidden', undefined, 'text-sm')).toBe('p-4 text-sm');
  });
});
