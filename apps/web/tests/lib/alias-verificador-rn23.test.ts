import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

const SRC = resolve(import.meta.dirname, '../../../../packages/clinical-language/src');
const MODULOS_DEL_CLIENTE = ['check-prohibited-terms.ts', 'normalizar.ts', 'secuencias.ts'];

/** Importaciones de ejecución con extensión `.js` (NodeNext) que Turbopack no reescribe a `.ts`. */
function importacionesJs(archivo: string): string[] {
  const fuente = readFileSync(resolve(SRC, archivo), 'utf8');
  return [...fuente.matchAll(/^import (?!type)[^;]*?from '(\.\/[^']+\.js)';/gms)].map((m) => m[1]!);
}

describe('alias de Turbopack para el verificador RN-23 en el navegador', () => {
  it('declara un alias existente para cada importación .js del verificador que entra al bundle [US-246 AC-1]', () => {
    const alias = nextConfig.turbopack?.resolveAlias ?? {};
    const requeridas = new Set(MODULOS_DEL_CLIENTE.flatMap(importacionesJs));

    expect([...requeridas].sort()).toEqual(Object.keys(alias).sort());
    for (const destino of Object.values(alias)) {
      expect(existsSync(resolve(import.meta.dirname, '../..', destino as string))).toBe(true);
    }
  });
});
