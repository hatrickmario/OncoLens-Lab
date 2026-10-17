import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { conectar, type BaseDeTest } from '../../support/db.js';
import {
  RUTA_DEL_CATALOGO,
  crearBaseDelSeed,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  seedContraLaBase,
  type ArchivosDeContrasena,
} from '../../support/seed.js';

interface EntradaLeida {
  terminoCanonico: string;
  estandar: string;
  codigo: string;
  nombreOficial: string;
}

/** Lee el catálogo por su cuenta (sin usar el lector del seed): el test verifica el seed contra los archivos. */
function entradasDelCatalogo(): EntradaLeida[] {
  return ['mama', 'prostata'].flatMap(
    (tipo) =>
      (
        JSON.parse(readFileSync(join(RUTA_DEL_CATALOGO, tipo, 'codigos.json'), 'utf8')) as {
          entradas: EntradaLeida[];
        }
      ).entradas,
  );
}

function entradaDe(estandar: string, termino: string): EntradaLeida | undefined {
  return entradasDelCatalogo().find(
    (entrada) => entrada.estandar === estandar && entrada.terminoCanonico === termino,
  );
}

describe('Códigos del seed solo desde el catálogo versionado', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let archivos: ArchivosDeContrasena;

  beforeAll(async () => {
    base = await crearBaseDelSeed('catalogo');
    cliente = await conectar(base.url);
    archivos = escribirArchivosDeContrasena();
    await seedContraLaBase(base.url).ejecutar(entornoDelSeed(archivos));
  });

  afterAll(async () => {
    archivos.limpiar();
    await cliente.end();
    await base.destruir();
  });

  it('cada código sembrado es el de la entrada del catálogo de su término canónico [US-039 AC-4]', async () => {
    const diagnosticos = await cliente.query<{
      cancer_type: string;
      icd10_code: string | null;
      mapping_status: string;
    }>('SELECT cancer_type, icd10_code, mapping_status FROM clinical.diagnosis');
    const biomarcadores = await cliente.query<{
      name: string;
      loinc_code: string | null;
      mapping_status: string;
    }>('SELECT name, loinc_code, mapping_status FROM clinical.biomarker');
    const tratamientos = await cliente.query<{
      regimen_name: string;
      atc_codes: string[];
      mapping_status: string;
    }>('SELECT regimen_name, atc_codes, mapping_status FROM clinical.prior_treatment');

    const sembrados = [
      ...diagnosticos.rows.map((fila) => ({
        estandar: 'cie10',
        termino: fila.cancer_type,
        codigos: fila.icd10_code === null ? [] : [fila.icd10_code],
        estado: fila.mapping_status,
      })),
      ...biomarcadores.rows.map((fila) => ({
        estandar: 'loinc',
        termino: fila.name,
        codigos: fila.loinc_code === null ? [] : [fila.loinc_code],
        estado: fila.mapping_status,
      })),
      ...tratamientos.rows.map((fila) => ({
        estandar: 'atc',
        termino: fila.regimen_name,
        codigos: fila.atc_codes,
        estado: fila.mapping_status,
      })),
    ];

    const conCodigo = sembrados.filter((dato) => dato.codigos.length > 0);
    expect(conCodigo.length).toBeGreaterThan(0);
    for (const dato of sembrados) {
      const entrada = entradaDe(dato.estandar, dato.termino);
      expect(dato.codigos).toEqual(entrada === undefined ? [] : [entrada.codigo]);
      expect(dato.estado).toBe(entrada === undefined ? 'no_mapeado' : 'mapeado');
      if (entrada !== undefined) {
        expect(existsSync(join(RUTA_DEL_CATALOGO, `NOTICE-${dato.estandar}.txt`))).toBe(true);
      }
    }
  });

  it('un biomarcador sin entrada en el catálogo queda con código nulo y no_mapeado, sin descartarse [US-039 AC-4]', async () => {
    const { rows } = await cliente.query<{ loinc_code: string | null; mapping_status: string }>(
      `SELECT loinc_code, mapping_status FROM clinical.biomarker WHERE name = 'Receptor de progesterona'`,
    );

    expect(rows).toEqual([{ loinc_code: null, mapping_status: 'no_mapeado' }]);
  });
});
