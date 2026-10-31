import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

const WEB = resolve(import.meta.dirname, '../..');
const SRC = resolve(WEB, '../../packages/clinical-language/src');
const ENTRADA = 'check-prohibited-terms.ts';

/** `import … from './x.js'` y `export … from './x.js'`, también los de tipos (Turbopack no los reescribe a `.ts`). */
function importacionesJs(archivo: string): string[] {
  const fuente = readFileSync(resolve(SRC, archivo), 'utf8');
  return [...fuente.matchAll(/^(?:import|export)\s[^;]*?from\s+'(\.\/[^']+\.js)'/gms)].map(
    (m) => m[1]!,
  );
}

/** Cierre transitivo de las importaciones relativas que entran al bundle desde la entrada del verificador. */
function importacionesTransitivas(entrada: string): Set<string> {
  const vistas = new Set<string>();
  const pendientes = [entrada];
  while (pendientes.length > 0) {
    for (const ruta of importacionesJs(pendientes.pop()!)) {
      if (vistas.has(ruta)) continue;
      vistas.add(ruta);
      pendientes.push(ruta.replace(/\.js$/, '.ts'));
    }
  }
  return vistas;
}

function archivosFuente(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = resolve(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivosFuente(ruta);
    return /\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

describe('alias de Turbopack para el verificador RN-23 en el navegador', () => {
  it('declara un alias existente para cada importación .js transitiva del verificador [US-246 AC-1]', () => {
    const alias = nextConfig.turbopack?.resolveAlias ?? {};
    const requeridas = [...importacionesTransitivas(ENTRADA)].sort();

    expect(Object.keys(alias).sort()).toEqual(requeridas);
    for (const destino of Object.values(alias)) {
      expect(existsSync(resolve(WEB, destino as string))).toBe(true);
    }
  });

  it('solo el filtro textoSiPermitido importa el código fuente de clinical-language en apps/web [US-246 AC-1]', () => {
    const importadores = ['app', 'components', 'lib']
      .flatMap((carpeta) => archivosFuente(resolve(WEB, carpeta)))
      .filter((ruta) => /clinical-language\/src/.test(readFileSync(ruta, 'utf8')))
      .map((ruta) => ruta.slice(WEB.length + 1));

    expect(importadores).toEqual(['lib/evidence/texto-si-permitido.ts']);
  });
});
