import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ARCHIVOS_DE_RAIZ,
  ARCHIVOS_DE_RAIZ_DECLARADOS_POR_EL_MANIFIESTO,
} from '../../../../../packages/clinical-catalogs/validator/index.mjs';
import { exigirCatalogoValido } from '../../../src/infrastructure/catalogo/validar-catalogo.js';
import { RUTA_CATALOGO_FX01BB } from '../../support/catalogo-terminologico.js';

/**
 * G1.6 (S7.1, design D15): los archivos de los registros del validador llegan solos al arranque de `clinical-api`.
 * Un archivo nuevo se prueba aquí sin editar ningún mapa de esquemas; el test no fija sus claves (`l1d-335` añadirá
 * `sinonimos`).
 */
type Registro = Record<string, unknown>;

const esquemaFicticio = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['version'],
  properties: { version: { type: 'string' } },
});

const lectorConArchivo = (nombre: string, contenido: object) => (ruta: string) => {
  if (ruta.endsWith(`/${nombre}.schema.json`)) return esquemaFicticio;
  if (ruta.endsWith(`/${nombre}.json`)) return JSON.stringify(contenido);
  return readFileSync(ruta, 'utf8');
};

/** Registra una entrada ficticia mientras dura `prueba` y la retira siempre (try/finally). */
function conEntrada(registro: Registro, nombre: string, entrada: unknown, prueba: () => void) {
  registro[nombre] = entrada;
  try {
    prueba();
  } finally {
    delete registro[nombre];
  }
}

const deLaRaiz = ARCHIVOS_DE_RAIZ as Registro;
// Declarado por una clave que el manifiesto del fixture ya trae en `true` (`escalas`): el esquema del manifiesto no admite claves nuevas.
const declaradoPorElManifiesto = ARCHIVOS_DE_RAIZ_DECLARADOS_POR_EL_MANIFIESTO as Registro;
const ENTRADA_DECLARADA = { esquema: 'ficticio', clave: 'escalas', reglas: () => [] };

describe('exigirCatalogoValido con un archivo nuevo en un registro del validador', () => {
  it('arranca cuando el archivo de raíz nuevo cumple su esquema y no está en una lista a mano [US-121 AC-1]', () => {
    conEntrada(deLaRaiz, 'ficticio', { esquema: 'ficticio' }, () => {
      expect(() =>
        exigirCatalogoValido(RUTA_CATALOGO_FX01BB, lectorConArchivo('ficticio', { version: '1' })),
      ).not.toThrow();
    });
  });

  it('rechaza con esquema_invalido cuando el archivo de raíz nuevo incumple su esquema', () => {
    conEntrada(deLaRaiz, 'ficticio', { esquema: 'ficticio' }, () => {
      expect(() =>
        exigirCatalogoValido(
          RUTA_CATALOGO_FX01BB,
          lectorConArchivo('ficticio', { version: '1', sobrante: true }),
        ),
      ).toThrow(/esquema_invalido/);
    });
  });

  it('arranca cuando el archivo declarado por el manifiesto cumple su esquema y no está en una lista a mano', () => {
    conEntrada(declaradoPorElManifiesto, 'ficticio', ENTRADA_DECLARADA, () => {
      expect(() =>
        exigirCatalogoValido(RUTA_CATALOGO_FX01BB, lectorConArchivo('ficticio', { version: '1' })),
      ).not.toThrow();
    });
  });

  it('rechaza con esquema_invalido cuando el archivo declarado por el manifiesto incumple su esquema', () => {
    conEntrada(declaradoPorElManifiesto, 'ficticio', ENTRADA_DECLARADA, () => {
      expect(() =>
        exigirCatalogoValido(
          RUTA_CATALOGO_FX01BB,
          lectorConArchivo('ficticio', { version: '1', sobrante: true }),
        ),
      ).toThrow(/esquema_invalido/);
    });
  });
});
