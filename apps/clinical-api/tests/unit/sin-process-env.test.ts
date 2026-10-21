import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ_SRC = path.resolve(import.meta.dirname, '../../src');
/** Único lugar donde el entorno entra al proceso: la raíz de composición se lo pasa al módulo de configuración. */
const RAIZ_DE_COMPOSICION = path.join(RAIZ_SRC, 'server.ts');
const MODULO_DE_CONFIGURACION = path.join(RAIZ_SRC, 'config') + path.sep;

const LECTURA_DE_ENTORNO = /\bprocess\s*(?:\.\s*env\b|\[\s*['"`]env['"`]\s*\])/;

function archivosTs(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(directorio, entrada.name);
    if (entrada.isDirectory()) return archivosTs(ruta);
    return entrada.name.endsWith('.ts') ? [ruta] : [];
  });
}

describe('lectura del entorno', () => {
  it('detecta process.env en sus formas de acceso, para que la regla de abajo no pase por un detector roto [US-037 AC-1]', () => {
    for (const lectura of [
      'const a = process.env.PORT;',
      "const b = process.env['PORT'];",
      'const c = process . env;',
      "const d = process['env'];",
      'const { PORT } = process.env;',
    ]) {
      expect(LECTURA_DE_ENTORNO.test(lectura), lectura).toBe(true);
    }
    expect(LECTURA_DE_ENTORNO.test('const e = entorno.env;')).toBe(false);
  });

  it('ningún archivo de src fuera de src/config y de la raíz de composición lee process.env [US-037 AC-1]', () => {
    const infractores = archivosTs(RAIZ_SRC)
      .filter((ruta) => ruta !== RAIZ_DE_COMPOSICION && !ruta.startsWith(MODULO_DE_CONFIGURACION))
      .filter((ruta) => LECTURA_DE_ENTORNO.test(readFileSync(ruta, 'utf8')))
      .map((ruta) => path.relative(RAIZ_SRC, ruta));

    expect(infractores).toEqual([]);
  });

  it('el módulo de configuración tampoco lee process.env: recibe el entorno por parámetro [US-037 AC-1]', () => {
    const infractores = archivosTs(path.join(RAIZ_SRC, 'config'))
      .filter((ruta) => LECTURA_DE_ENTORNO.test(readFileSync(ruta, 'utf8')))
      .map((ruta) => path.relative(RAIZ_SRC, ruta));

    expect(infractores).toEqual([]);
  });
});
