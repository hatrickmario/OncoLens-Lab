import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(import.meta.dirname, '../../..');
const SMOKE = readFileSync(resolve(RAIZ, 'scripts/smoke/compose-smoke.sh'), 'utf8');
const leerJson = (ruta) => JSON.parse(readFileSync(resolve(RAIZ, ruta), 'utf8'));

describe('compose-smoke.sh · peticiones a /rag/query con el catálogo montado [US-041]', () => {
  it('necesita sustituir catalogVersion porque el ejemplo del contrato difiere del manifiesto montado', () => {
    const ejemplo = leerJson('contracts/examples/rag-query-request.json');
    const manifiesto = leerJson('packages/clinical-catalogs/manifest.json');

    expect(ejemplo.catalogVersion).not.toBe(manifiesto.version);
  });

  it('envía toda petición del AC-6 y del 401 por peticion_con_catalogo_montado, nunca el ejemplo directo', () => {
    const lineas = SMOKE.split('\n').filter(
      (linea) => linea.includes('contracts/examples/') && linea.includes('consultar_rag'),
    );

    expect(lineas.length).toBeGreaterThanOrEqual(2);
    for (const linea of lineas) expect(linea).toContain('peticion_con_catalogo_montado');
    expect(SMOKE).not.toMatch(/consultar_rag[^\n]*<\s*"\$raiz\/contracts\/examples/);
  });
});
