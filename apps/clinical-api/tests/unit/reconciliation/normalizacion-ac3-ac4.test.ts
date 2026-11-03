import { describe, expect, it } from 'vitest';
import {
  RUTA_CATALOGO_FX01BB,
  RUTA_CATALOGO_REAL,
  VERSION_CATALOGO_FX01BB,
} from '../../support/catalogo-terminologico.js';
import { servicioSobreCatalogo } from '../../support/reconciliation.js';

describe('ReconciliationService: normalización final de datos manuales (AC-3, AC-4)', () => {
  const servicio = () => servicioSobreCatalogo(RUTA_CATALOGO_FX01BB).servicio;

  it('normaliza ERBB2 a HER2 con LOINC-T-HER2 y mapeado [US-098 AC-3]', () => {
    const decision = servicio().decidir({
      entidad: 'Biomarker',
      tipoDeCancer: 'mama',
      textoOriginal: 'ERBB2',
    });

    expect(decision).toMatchObject({
      name: 'HER2',
      loincCode: 'LOINC-T-HER2',
      originalName: 'ERBB2',
      mappingStatus: 'mapeado',
    });
  });

  it('reconoce her-2/NEU y c-erbB-2 con espacios como HER2 conservando el texto original [US-098 AC-3]', () => {
    const decisiones = ['her-2/NEU', ' c-erbB-2 '].map((textoOriginal) =>
      servicio().decidir({ entidad: 'Biomarker', tipoDeCancer: 'mama', textoOriginal }),
    );

    expect(decisiones.map((d) => [d.name, d.mappingStatus, d.originalName])).toEqual([
      ['HER2', 'mapeado', 'her-2/NEU'],
      ['HER2', 'mapeado', ' c-erbB-2 '],
    ]);
  });

  it('asigna L02AE02 y la catalogVersion montada a leuprorelina [US-098 AC-4]', () => {
    const decision = servicio().decidir({
      entidad: 'PriorTreatment',
      tipoDeCancer: 'prostata',
      textoOriginal: 'leuprorelina',
    });
    const otra = servicio().decidir({
      entidad: 'Biomarker',
      tipoDeCancer: 'prostata',
      textoOriginal: 'PSA',
    });

    expect(decision).toMatchObject({
      atcCodes: ['L02AE02'],
      mappingStatus: 'mapeado',
      catalogVersion: VERSION_CATALOGO_FX01BB,
    });
    expect(otra.catalogVersion).toBe(decision.catalogVersion);
  });

  it('deja no_mapeado sin código Fármaco experimental X [US-098 AC-4]', () => {
    const decision = servicio().decidir({
      entidad: 'PriorTreatment',
      tipoDeCancer: 'prostata',
      textoOriginal: 'Fármaco experimental X',
    });

    expect(decision).toMatchObject({
      atcCodes: [],
      mappingStatus: 'no_mapeado',
      name: 'Fármaco experimental X',
      originalName: 'Fármaco experimental X',
    });
  });

  it('deja no_mapeado un biomarcador ausente del subconjunto LOINC del catálogo real [US-098 AC-4]', () => {
    const real = servicioSobreCatalogo(RUTA_CATALOGO_REAL).servicio;

    const decision = real.decidir({
      entidad: 'Biomarker',
      tipoDeCancer: 'mama',
      textoOriginal: 'Marcador sintético Z',
    });

    expect(decision).toMatchObject({
      mappingStatus: 'no_mapeado',
      loincCode: null,
      originalName: 'Marcador sintético Z',
    });
  });
});
