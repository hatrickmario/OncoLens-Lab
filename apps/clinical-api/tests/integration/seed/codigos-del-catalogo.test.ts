import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { PACIENTES_SEMILLA } from '../../../prisma/seed/pacientes/indice.js';
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

/** Fármacos de cada régimen del seed según los DATOS de los pacientes (`farmacos`, o el régimen entero si no hay). */
const FARMACOS_POR_REGIMEN = new Map(
  PACIENTES_SEMILLA.flatMap((paciente) => paciente.tratamientosPrevios).map((tratamiento) => [
    tratamiento.regimen,
    tratamiento.farmacos ?? [tratamiento.regimen],
  ]),
);

/** Términos canónicos de un dato sembrado: para un régimen ATC, los de los datos del seed; el resto, el término entero. */
function terminosDe(dato: { estandar: string; termino: string }): readonly string[] {
  return dato.estandar === 'atc'
    ? (FARMACOS_POR_REGIMEN.get(dato.termino) ?? [dato.termino])
    : [dato.termino];
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
      // Un régimen combinado (US-254) lleva el código de cada fármaco que el catálogo conoce y solo es `mapeado` si los
      // conoce todos; un término sin combinar sigue resolviéndose entero, como antes.
      const entradas = terminosDe(dato).map((termino) => entradaDe(dato.estandar, termino));
      const conocidas = entradas.flatMap((entrada) => (entrada === undefined ? [] : [entrada]));
      expect(dato.codigos).toEqual(conocidas.map((entrada) => entrada.codigo));
      expect(dato.estado).toBe(conocidas.length === entradas.length ? 'mapeado' : 'no_mapeado');
      if (conocidas.length > 0) {
        expect(existsSync(join(RUTA_DEL_CATALOGO, `NOTICE-${dato.estandar}.txt`))).toBe(true);
      }
    }
  });

  it('un régimen cuyos farmacos difieren de su nombre usa los términos de farmacos y no el nombre [US-254 AC-1] [RN-27]', async () => {
    const combinados = [...FARMACOS_POR_REGIMEN].filter(
      ([regimen, farmacos]) => farmacos.length !== 1 || farmacos[0] !== regimen,
    );
    expect(combinados.map(([regimen]) => regimen)).toContain('Leuprorelina + abiraterona');

    for (const [regimen, farmacos] of combinados) {
      const { rows } = await cliente.query<{ atc_codes: string[] }>(
        'SELECT atc_codes FROM clinical.prior_treatment WHERE regimen_name = $1',
        [regimen],
      );
      const esperados = farmacos.flatMap((farmaco) => entradaDe('atc', farmaco)?.codigo ?? []);

      expect(rows.length, regimen).toBeGreaterThan(0);
      for (const fila of rows) expect(fila.atc_codes, regimen).toEqual(esperados);
      // El nombre del régimen entero no es un término del catálogo: nunca se resuelve por él.
      expect(entradaDe('atc', regimen), regimen).toBeUndefined();
    }
  });

  it('un biomarcador sin entrada en el catálogo queda con código nulo y no_mapeado, sin descartarse [US-039 AC-4]', async () => {
    const { rows } = await cliente.query<{ loinc_code: string | null; mapping_status: string }>(
      `SELECT loinc_code, mapping_status FROM clinical.biomarker WHERE name = 'HER2'`,
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const fila of rows)
      expect(fila).toEqual({ loinc_code: null, mapping_status: 'no_mapeado' });
  });
});
