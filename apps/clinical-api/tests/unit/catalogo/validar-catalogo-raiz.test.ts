import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { ARCHIVOS_DE_RAIZ } from '../../../../../packages/clinical-catalogs/validator/index.mjs';
import { exigirCatalogoValido } from '../../../src/infrastructure/catalogo/validar-catalogo.js';
import { RUTA_CATALOGO_FX01BB } from '../../support/catalogo-terminologico.js';

/**
 * G1.6 (S7.1, design D15): los archivos de raíz del registro `ARCHIVOS_DE_RAIZ` llegan solos al arranque de
 * `clinical-api`. Un archivo de raíz nuevo se prueba aquí sin editar el mapa de esquemas; el test no fija la lista de
 * claves del mapa (el resto de entradas sigue abierto: `l1d-335` añadirá `sinonimos`).
 */
const raiz = ARCHIVOS_DE_RAIZ as Record<string, { esquema: string }>;

const esquemaFicticio = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['version'],
  properties: { version: { type: 'string' } },
});

const lectorConArchivoDeRaiz = (contenido: object) => (ruta: string) => {
  if (ruta.endsWith('/ficticio.schema.json')) return esquemaFicticio;
  if (ruta.endsWith('/ficticio.json')) return JSON.stringify(contenido);
  return readFileSync(ruta, 'utf8');
};

describe('exigirCatalogoValido con un archivo de raíz nuevo en el registro', () => {
  afterEach(() => {
    delete raiz.ficticio;
  });

  it('arranca cuando el archivo de raíz nuevo cumple su esquema y no está en una lista a mano [US-121 AC-1]', () => {
    raiz.ficticio = { esquema: 'ficticio' };

    expect(() =>
      exigirCatalogoValido(RUTA_CATALOGO_FX01BB, lectorConArchivoDeRaiz({ version: '1' })),
    ).not.toThrow();
  });

  it('rechaza con esquema_invalido cuando el archivo de raíz nuevo incumple su esquema', () => {
    raiz.ficticio = { esquema: 'ficticio' };

    expect(() =>
      exigirCatalogoValido(
        RUTA_CATALOGO_FX01BB,
        lectorConArchivoDeRaiz({ version: '1', sobrante: true }),
      ),
    ).toThrow(/esquema_invalido/);
  });
});
