import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ICONO = new URL('../../app/icon.svg', import.meta.url);

describe('Icono de la aplicación', () => {
  it('existe app/icon.svg para que el navegador no pida /favicon.ico y registre un 404 en consola [ARR-09 AC-1]', () => {
    expect(existsSync(ICONO)).toBe(true);
  });

  it('es un SVG sin scripts ni recursos externos', () => {
    const contenido = readFileSync(ICONO, 'utf8');

    expect(contenido).toMatch(/^<svg[\s>]/);
    expect(contenido).not.toMatch(/<script|https?:\/\/(?!www\.w3\.org)|href=/i);
  });
});
