import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERSION_DEL_CATALOGO_GUIADAS } from '../../lib/server/catalogo-guiadas';

const raiz = resolve(import.meta.dirname, '../../../..');
const leer = (ruta: string) => readFileSync(resolve(raiz, ruta), 'utf8');
const fuente = leer('apps/web/lib/server/catalogo-guiadas.ts');
const importados = [...fuente.matchAll(/packages\/(clinical-catalogs\/[\w/-]+\.json)'/g)].map(
  (m) => `packages/${m[1]}`,
);
/** Compara `x.y.z` componente a componente: negativo, cero o positivo como `a - b`. */
const compararVersiones = (a: string, b: string): number => {
  const [x, y] = [a, b].map((version) => version.split('.').map(Number)) as [number[], number[]];
  return x.reduce((resultado, n, i) => (resultado !== 0 ? resultado : Math.sign(n - y[i]!)), 0);
};
const menorOIgual = (a: string, b: string) => compararVersiones(a, b) <= 0;

describe('catálogo importado por las preguntas guiadas [US-267 AC-8]', () => {
  it('declara la versión del manifest de packages/clinical-catalogs', () => {
    const manifest = JSON.parse(leer('packages/clinical-catalogs/manifest.json')) as { version: string };

    expect(VERSION_DEL_CATALOGO_GUIADAS).toBe(manifest.version);
  });

  it('importa solo archivos cuya versión no supera la del manifest y plantillas con la del manifest', () => {
    expect(importados.length).toBeGreaterThanOrEqual(8);
    for (const ruta of importados) {
      const { version } = JSON.parse(leer(ruta)) as { version?: string };
      // `codigos.json` no declara versión propia: la gobierna el manifest.
      if (version === undefined) continue;
      expect(menorOIgual(version, VERSION_DEL_CATALOGO_GUIADAS), `${ruta} ${version}`).toBe(true);
      if (ruta.endsWith('/plantillas.json')) expect(version).toBe(VERSION_DEL_CATALOGO_GUIADAS);
    }
  });

  it('copia cada archivo importado en el Dockerfile de web para que el build lo encuentre', () => {
    const dockerfile = leer('apps/web/Dockerfile');

    for (const ruta of importados) {
      expect(dockerfile, ruta).toContain(`COPY ${ruta} ${ruta}`);
    }
  });
});
