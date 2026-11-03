import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RUTA_CATALOGO_FX01BB } from '../../support/catalogo-terminologico.js';
import { servicioSobreCatalogo } from '../../support/reconciliation.js';

describe('ReconciliationService: ningún código fuera del catálogo (AC-2)', () => {
  const servicio = () => servicioSobreCatalogo(RUTA_CATALOGO_FX01BB).servicio;
  let directorio: string;
  beforeEach(() => {
    directorio = mkdtempSync(path.join(tmpdir(), 'reconciliation-'));
  });
  afterEach(() => rmSync(directorio, { recursive: true, force: true }));

  it('descarta el código 99999-9 y deja no_mapeado con el texto original [US-098 AC-2]', () => {
    const decision = servicio().decidir({
      entidad: 'Biomarker',
      tipoDeCancer: 'mama',
      textoOriginal: 'marcador XYZ',
      codigoPropuesto: '99999-9',
    });

    expect(decision).toMatchObject({
      mappingStatus: 'no_mapeado',
      loincCode: null,
      originalName: 'marcador XYZ',
      name: 'marcador XYZ',
    });
  });

  it('sustituye un código inválido por el del catálogo cuando el texto es sinónimo [US-098 AC-2]', () => {
    const decision = servicio().decidir({
      entidad: 'Biomarker',
      tipoDeCancer: 'mama',
      textoOriginal: 'c-erbB-2',
      codigoPropuesto: '99999-9',
    });

    expect(decision).toMatchObject({ loincCode: 'LOINC-T-HER2', mappingStatus: 'mapeado' });
  });

  it('no acepta un código de otro estándar [US-098 AC-2]', () => {
    const decision = servicio().decidir({
      entidad: 'Biomarker',
      tipoDeCancer: 'prostata',
      textoOriginal: 'texto sin coincidencia',
      codigoPropuesto: 'L02AE02',
    });

    expect(decision).toMatchObject({ mappingStatus: 'no_mapeado', loincCode: null, atcCodes: [] });
  });

  it('acepta un código propuesto presente en el catálogo para su estándar [US-098 AC-2]', () => {
    const decision = servicio().decidir({
      entidad: 'Diagnosis',
      tipoDeCancer: 'mama',
      textoOriginal: 'carcinoma ductal',
      codigoPropuesto: 'C50.9',
    });

    expect(decision).toMatchObject({ icd10Code: 'C50.9', mappingStatus: 'mapeado', name: 'mama' });
  });

  it('devuelve no_mapeado sin error con un tipo de cáncer sin entradas [US-098 AC-2]', () => {
    cpSync(RUTA_CATALOGO_FX01BB, directorio, { recursive: true });
    writeFileSync(path.join(directorio, 'prostata/codigos.json'), '{"entradas":[]}');
    writeFileSync(
      path.join(directorio, 'prostata/sinonimos.json'),
      '{"version":"1.0.0","items":[]}',
    );

    const decision = servicioSobreCatalogo(directorio).servicio.decidir({
      entidad: 'Biomarker',
      tipoDeCancer: 'prostata',
      textoOriginal: 'PSA',
    });

    expect(decision).toMatchObject({
      mappingStatus: 'no_mapeado',
      originalName: 'PSA',
      loincCode: null,
    });
  });
});

describe('ReconciliationService: mapping_status siempre definido (AC-5)', () => {
  const servicio = () => servicioSobreCatalogo(RUTA_CATALOGO_FX01BB).servicio;

  it('devuelve mapping_status no nulo en Diagnosis, Biomarker, PriorTreatment y ClinicalEvent procedimiento [US-098 AC-5]', () => {
    const decisiones = [
      servicio().decidir({
        entidad: 'Diagnosis',
        tipoDeCancer: 'mama',
        textoOriginal: 'Cáncer de mama',
        codigoPropuesto: 'C50.9',
      }),
      servicio().decidir({ entidad: 'Biomarker', tipoDeCancer: 'mama', textoOriginal: 'ERBB2' }),
      servicio().decidir({
        entidad: 'PriorTreatment',
        tipoDeCancer: 'prostata',
        textoOriginal: 'Fármaco experimental X',
      }),
      servicio().decidir({
        entidad: 'ClinicalEvent',
        tipoDeCancer: 'mama',
        tipoDeEvento: 'procedimiento',
        textoOriginal: 'biopsia de mama',
      }),
    ];

    expect(decisiones.map((d) => d.mappingStatus)).toEqual([
      'mapeado',
      'mapeado',
      'no_mapeado',
      'mapeado',
    ]);
  });

  it('devuelve n_a sin códigos en un ClinicalEvent progresion [US-098 AC-5]', () => {
    const decision = servicio().decidir({
      entidad: 'ClinicalEvent',
      tipoDeCancer: 'mama',
      tipoDeEvento: 'progresion',
      textoOriginal: 'progresión hepática',
    });

    expect(decision).toMatchObject({ mappingStatus: 'n_a', icd10Code: null, cupsCode: null });
  });
});
