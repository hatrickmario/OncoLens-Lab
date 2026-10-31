import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CATALOGO, PLAZO_PROCESO_MS, ejecutarValidador, modificarJson } from './apoyo.mjs';

const copias = [];
afterEach(() => {
  for (const raiz of copias.splice(0)) rmSync(raiz, { recursive: true, force: true });
});

/** Copia del catálogo REAL (sin fixtures ni validador) para romperla sin tocar el original. */
function copiarElCatalogoReal() {
  const raiz = mkdtempSync(path.join(os.tmpdir(), 'catalogo-real-'));
  copias.push(raiz);
  cpSync(CATALOGO, raiz, {
    recursive: true,
    filter: (origen) => !['test', 'validator', 'node_modules'].includes(path.basename(origen)),
  });
  return raiz;
}

describe('catalog:validate · poblacion-reglas.json declarado en el manifiesto (D4-03)', () => {
  it(
    'acepta el catálogo real 1.2.0 con las reglas de población de mama y próstata',
    () => {
      const resultado = ejecutarValidador(CATALOGO);

      expect(resultado.codigo).toBe(0);
      expect(resultado.salida).toContain('catalogVersion=1.2.0');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza con hash_distinto cuando cambia un marcador de restricción sin actualizar el catalogHash',
    () => {
      const catalogo = copiarElCatalogoReal();
      modificarJson(catalogo, 'mama/poblacion-reglas.json', (c) =>
        c.restrictionMarkers.es.push('unicamente'),
      );

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('hash_distinto mama/poblacion-reglas');
    },
    PLAZO_PROCESO_MS,
  );

  it(
    'rechaza con esquema_invalido cuando el archivo trae un campo desconocido',
    () => {
      const catalogo = copiarElCatalogoReal();
      modificarJson(catalogo, 'prostata/poblacion-reglas.json', (c) => (c.puntaje = 1));

      const resultado = ejecutarValidador(catalogo);

      expect(resultado.codigo).not.toBe(0);
      expect(resultado.salida).toContain('esquema_invalido prostata/poblacion-reglas');
    },
    PLAZO_PROCESO_MS,
  );
});
