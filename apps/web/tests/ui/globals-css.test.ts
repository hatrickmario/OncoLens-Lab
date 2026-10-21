import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raizWeb = resolve(import.meta.dirname, '../..');

function cssSinComentarios(ruta: string): string {
  return readFileSync(ruta, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

function quedanCssModules(): boolean {
  return readdirSync(raizWeb, { recursive: true, encoding: 'utf8' }).some(
    (ruta) =>
      ruta.endsWith('.module.css') && !ruta.startsWith('node_modules') && !ruta.startsWith('.next'),
  );
}

const css = cssSinComentarios(resolve(raizWeb, 'app/globals.css'));

describe('globals.css', () => {
  it('no importa el preflight de Tailwind ni la hoja completa mientras queden pantallas en CSS Modules [ARR-02 AC-3]', () => {
    // El preflight quita tamaño y peso a h1-h3, listas, dl y button de las pantallas sin migrar.
    expect(css).not.toMatch(/preflight/);
    expect(css).not.toMatch(/@import\s+['"]tailwindcss(\/index\.css)?['"]/);
    expect(css).toMatch(/@import\s+['"]tailwindcss\/theme\.css['"]/);
    expect(css).toMatch(/@import\s+['"]tailwindcss\/utilities\.css['"]/);
  });

  it('sigue habiendo pantallas en CSS Modules; si ya no, retira este archivo y adopta el preflight (design.md D3)', () => {
    expect(quedanCssModules()).toBe(true);
  });
});
