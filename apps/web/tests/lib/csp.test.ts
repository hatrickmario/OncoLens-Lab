import { describe, expect, it } from 'vitest';
import { construirCsp, generarNonce, leerModoCsp } from '../../lib/server/csp';

const NONCE = 'bm9uY2UtY29uZ2VsYWRv';

function directiva(valor: string, nombre: string): string {
  return (
    valor
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${nombre} `)) ?? ''
  );
}

describe('construirCsp', () => {
  it('incluye las directivas estrictas de US-216 cuando el modo es aplicar [US-216 AC-1]', () => {
    const { nombre, valor } = construirCsp({ nonce: NONCE, modo: 'aplicar', desarrollo: false });

    expect(nombre).toBe('Content-Security-Policy');
    expect(valor).toContain("default-src 'self'");
    expect(valor).toContain("object-src 'none'");
    expect(valor).toContain("base-uri 'none'");
    expect(valor).toContain("frame-ancestors 'none'");
    expect(directiva(valor, 'script-src')).toContain(`'nonce-${NONCE}'`);
  });

  it('no admite unsafe-inline ni unsafe-eval en script-src cuando el modo es aplicar [US-216 AC-1]', () => {
    for (const desarrollo of [false, true]) {
      const { valor } = construirCsp({ nonce: NONCE, modo: 'aplicar', desarrollo });
      const scripts = directiva(valor, 'script-src');
      expect(scripts).not.toContain('unsafe-inline');
      expect(scripts).not.toContain('unsafe-eval');
    }
  });

  it('acepta unsafe-inline solo en style-src-attr (P-1, S6 resp. 19)', () => {
    const { valor } = construirCsp({ nonce: NONCE, modo: 'aplicar', desarrollo: false });

    expect(directiva(valor, 'style-src-attr')).toBe("style-src-attr 'unsafe-inline'");
    expect(directiva(valor, 'style-src')).not.toContain('unsafe-inline');
  });

  it('emite Report-Only con unsafe-eval cuando el modo es solo_informe en desarrollo [US-216 AC-1]', () => {
    const { nombre, valor } = construirCsp({
      nonce: NONCE,
      modo: 'solo_informe',
      desarrollo: true,
    });

    expect(nombre).toBe('Content-Security-Policy-Report-Only');
    expect(directiva(valor, 'script-src')).toContain("'unsafe-eval'");
  });
});

describe('generarNonce', () => {
  it('devuelve 16 bytes en base64 distintos en cada llamada [US-216 AC-1]', () => {
    const a = generarNonce();
    const b = generarNonce();

    expect(Buffer.from(a, 'base64')).toHaveLength(16);
    expect(a).not.toBe(b);
  });
});

describe('leerModoCsp', () => {
  it('usa aplicar cuando WEB_CSP_MODO no está definida', () => {
    expect(leerModoCsp({ NODE_ENV: 'production' })).toBe('aplicar');
  });

  it('acepta solo_informe fuera de producción', () => {
    expect(leerModoCsp({ WEB_CSP_MODO: 'solo_informe', NODE_ENV: 'development' })).toBe(
      'solo_informe',
    );
  });

  it('falla nombrando WEB_CSP_MODO cuando es solo_informe en producción [US-216 AC-1]', () => {
    expect(() => leerModoCsp({ WEB_CSP_MODO: 'solo_informe', NODE_ENV: 'production' })).toThrow(
      'WEB_CSP_MODO',
    );
  });

  it('falla nombrando WEB_CSP_MODO sin imprimir el valor cuando no es un modo conocido', () => {
    expect(() => leerModoCsp({ WEB_CSP_MODO: 'secreto-xyz', NODE_ENV: 'development' })).toThrow(
      /WEB_CSP_MODO(?!.*secreto-xyz)/,
    );
  });
});
