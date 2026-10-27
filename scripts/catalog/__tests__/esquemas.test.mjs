import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARCHIVOS_DE_RAIZ,
  ARCHIVOS_DEL_CATALOGO,
  leerEsquemas,
} from '../../../packages/clinical-catalogs/validator/index.mjs';
import { CATALOGO } from './apoyo.mjs';

const leerTexto = (ruta) => readFileSync(ruta, 'utf8');
const esquemas = leerEsquemas(path.join(CATALOGO, 'schemas'), leerTexto);

const CON_VERSION = [
  'manifest',
  ...Object.values(ARCHIVOS_DE_RAIZ).map(({ esquema }) => esquema),
  ...Object.values(ARCHIVOS_DEL_CATALOGO).map(({ esquema }) => esquema),
];

describe('versión de los esquemas del catálogo (Gate 2 vuelta 1, punto 5)', () => {
  it.each(CON_VERSION)('el esquema %s remite a la definición única de version', (nombre) => {
    expect(esquemas[nombre].properties.version.$ref).toBe('comun.schema.json#/$defs/version');
  });

  it('la definición única admite x.y.z y el infijo de fixture, y rechaza el resto', () => {
    const patron = new RegExp(esquemas.comun.$defs.version.pattern);

    for (const valida of ['1.1.0', 'test-1.0.0', 'test-apl-1.0.1']) {
      expect(patron.test(valida), valida).toBe(true);
    }
    for (const invalida of ['1.1', 'v1.1.0', 'test-APL-1.0.0', '1.1.0-rc']) {
      expect(patron.test(invalida), invalida).toBe(false);
    }
  });
});
