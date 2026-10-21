import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../../app/globals.css'), 'utf8');

describe('globals.css', () => {
  it('no importa el preflight de Tailwind mientras queden pantallas en CSS Modules [ARR-02 AC-3]', () => {
    // El preflight quita tamaño y peso a h1-h3, listas, dl y button de las pantallas sin migrar.
    expect(css).not.toMatch(/@import\s+['"]tailwindcss['"]/);
    expect(css).toMatch(/@import\s+['"]tailwindcss\/theme\.css['"]/);
    expect(css).toMatch(/@import\s+['"]tailwindcss\/utilities\.css['"]/);
  });
});
