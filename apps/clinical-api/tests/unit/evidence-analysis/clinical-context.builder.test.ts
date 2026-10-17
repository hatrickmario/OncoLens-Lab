import { describe, expect, it } from 'vitest';
import {
  asignarDataRefs,
  construirContextoPermitido,
  mesesTranscurridos,
  provenanceDe,
} from '../../../src/modules/evidence-analysis/clinical-context.builder.js';
import {
  AHORA_DE_EJEMPLO,
  atributoDeEjemplo,
  biomarcadorDeEjemplo,
  casoDeEjemplo,
  diagnosticoDeEjemplo,
  eventoDeEjemplo,
  tratamientoPrevioDeEjemplo,
} from './casos.js';

describe('mesesTranscurridos', () => {
  it('devuelve null cuando la fecha es null', () => {
    expect(mesesTranscurridos(null, AHORA_DE_EJEMPLO)).toBeNull();
  });

  it('devuelve 0 cuando la fecha es el mismo día', () => {
    expect(mesesTranscurridos('2026-10-16', AHORA_DE_EJEMPLO)).toBe(0);
  });

  it('cuenta un mes completo cuando el día del mes ya llegó', () => {
    expect(mesesTranscurridos('2026-09-16', AHORA_DE_EJEMPLO)).toBe(1);
  });

  it('no cuenta el mes en curso cuando el día del mes aún no llegó', () => {
    expect(mesesTranscurridos('2026-09-17', AHORA_DE_EJEMPLO)).toBe(0);
  });

  it('cuenta doce meses por un año completo', () => {
    expect(mesesTranscurridos('2025-10-16', AHORA_DE_EJEMPLO)).toBe(12);
  });

  it('devuelve 0 cuando la fecha es posterior al reloj', () => {
    expect(mesesTranscurridos('2026-12-01', AHORA_DE_EJEMPLO)).toBe(0);
  });
});

describe('provenanceDe', () => {
  it('copia método, confianza y estado de revisión de la fila y marca conflict false sin conflicts_with_id', () => {
    expect(
      provenanceDe({
        entryMethod: 'ocr',
        extractionConfidence: 'media',
        reviewStatus: 'requiere_revision',
        conflictsWithId: null,
      }),
    ).toEqual({
      entryMethod: 'ocr',
      extractionConfidence: 'media',
      reviewStatus: 'requiere_revision',
      conflict: false,
    });
  });

  it('marca conflict true cuando la fila tiene conflicts_with_id', () => {
    expect(
      provenanceDe({
        entryMethod: 'ocr',
        extractionConfidence: 'alta',
        reviewStatus: 'requiere_revision',
        conflictsWithId: 'dx-0',
      }).conflict,
    ).toBe(true);
  });
});

describe('asignarDataRefs', () => {
  it('asigna r1, r2… en orden de llamada y recuerda qué dato respalda cada referencia', () => {
    const asignador = asignarDataRefs();

    const primero = asignador.asignar({ tabla: 'diagnosis', id: 'dx-1' });
    const segundo = asignador.asignar({ tabla: 'biomarker', id: 'bm-1' });

    expect([primero, segundo]).toEqual(['r1', 'r2']);
    expect([...asignador.mapa]).toEqual([
      ['r1', { tabla: 'diagnosis', id: 'dx-1' }],
      ['r2', { tabla: 'biomarker', id: 'bm-1' }],
    ]);
  });
});

describe('construirContextoPermitido', () => {
  it('arma el diagnóstico activo con el grupo ISUP en grade, fechas relativas y procedencia', () => {
    const { contexto } = construirContextoPermitido(casoDeEjemplo(), AHORA_DE_EJEMPLO);

    expect(contexto.diagnosis).toEqual({
      dataRef: 'r1',
      cancerType: 'prostata',
      histology: 'adenocarcinoma acinar',
      grade: 'Gleason 4+3=7 · ISUP 3',
      stagingSystem: 'TNM_8',
      stageValue: 'T2cN0M0',
      performanceScale: 'ECOG',
      performanceValue: 0,
      monthsSinceDiagnosis: 1,
      provenance: {
        entryMethod: 'seed',
        extractionConfidence: 'n_a',
        reviewStatus: 'verificado',
        conflict: false,
      },
    });
    expect(contexto.population).toBe('adulto');
  });

  it('deja el diagnóstico en null cuando el caso no tiene diagnóstico activo', () => {
    const { contexto } = construirContextoPermitido(
      casoDeEjemplo({ diagnosticoActivo: null }),
      AHORA_DE_EJEMPLO,
    );

    expect(contexto.diagnosis).toBeNull();
  });

  it('marca No disponible el sistema y el valor de estadificación cuando el diagnóstico no los tiene', () => {
    const { contexto } = construirContextoPermitido(
      casoDeEjemplo({
        diagnosticoActivo: diagnosticoDeEjemplo({ stagingSystem: null, stageValue: null }),
      }),
      AHORA_DE_EJEMPLO,
    );

    expect(contexto.diagnosis).toMatchObject({
      stagingSystem: 'No disponible',
      stageValue: 'No disponible',
    });
  });

  it('marca conflict true en el diagnóstico cuando conflicts_with_id no es null', () => {
    const { contexto } = construirContextoPermitido(
      casoDeEjemplo({
        diagnosticoActivo: diagnosticoDeEjemplo({
          reviewStatus: 'requiere_revision',
          conflictsWithId: 'dx-0',
        }),
      }),
      AHORA_DE_EJEMPLO,
    );

    expect(contexto.diagnosis?.provenance).toMatchObject({
      reviewStatus: 'requiere_revision',
      conflict: true,
    });
  });

  it('envía solo el último valor de cada biomarcador, por fecha del examen', () => {
    const { contexto } = construirContextoPermitido(
      casoDeEjemplo({
        biomarcadores: [
          biomarcadorDeEjemplo({ id: 'psa-1', value: '4.2', performedAt: '2026-03-01' }),
          biomarcadorDeEjemplo({ id: 'psa-3', value: '12.4', performedAt: '2026-09-26' }),
          biomarcadorDeEjemplo({ id: 'psa-2', value: '9.8', performedAt: '2026-08-20' }),
          biomarcadorDeEjemplo({
            id: 'her2',
            name: 'HER2',
            value: '3+',
            performedAt: '2026-01-10',
          }),
        ],
      }),
      AHORA_DE_EJEMPLO,
    );

    expect(contexto.biomarkers.map((b) => [b.biomarkerName, b.value])).toEqual([
      ['PSA', '12.4'],
      ['HER2', '3+'],
    ]);
    expect(contexto.biomarkers[0]).toMatchObject({
      resultType: 'cuantitativo',
      clinicalSignificance: 'alterado',
      monthsAgo: 0,
    });
  });

  it('desempata el último valor de un biomarcador por creación cuando comparten fecha de examen', () => {
    const { contexto } = construirContextoPermitido(
      casoDeEjemplo({
        biomarcadores: [
          biomarcadorDeEjemplo({ id: 'a', value: '1', createdAt: '2026-09-26T10:00:00.000Z' }),
          biomarcadorDeEjemplo({ id: 'b', value: '2', createdAt: '2026-09-26T11:00:00.000Z' }),
        ],
      }),
      AHORA_DE_EJEMPLO,
    );

    expect(contexto.biomarkers.map((b) => b.value)).toEqual(['2']);
  });

  it('calcula los meses del tratamiento previo y deja null la fecha que falta', () => {
    const { contexto } = construirContextoPermitido(
      casoDeEjemplo({
        tratamientosPrevios: [
          tratamientoPrevioDeEjemplo({
            startedAt: '2026-03-16',
            endedAt: null,
            atcCodes: ['L02AE02'],
          }),
        ],
      }),
      AHORA_DE_EJEMPLO,
    );

    expect(contexto.priorTreatments).toEqual([
      {
        dataRef: 'r2',
        lineNumber: 1,
        setting: 'primera_linea_metastasica',
        regimenName: 'Deprivación androgénica',
        atcCodes: ['L02AE02'],
        monthsSinceStart: 7,
        monthsSinceEnd: null,
        endReason: 'desconocido',
        provenance: expect.objectContaining({ conflict: false }),
      },
    ]);
  });

  it('fija currentLine en la línea más alta de los tratamientos en curso y null cuando ninguno está en curso', () => {
    const enCurso = construirContextoPermitido(
      casoDeEjemplo({
        tratamientosPrevios: [
          tratamientoPrevioDeEjemplo({ id: 'tp-1', lineNumber: 1, ongoing: false }),
          tratamientoPrevioDeEjemplo({ id: 'tp-2', lineNumber: 2, ongoing: true }),
          tratamientoPrevioDeEjemplo({ id: 'tp-3', lineNumber: null, ongoing: true }),
        ],
      }),
      AHORA_DE_EJEMPLO,
    );
    const terminados = construirContextoPermitido(
      casoDeEjemplo({
        tratamientosPrevios: [tratamientoPrevioDeEjemplo({ ongoing: false })],
      }),
      AHORA_DE_EJEMPLO,
    );

    expect(enCurso.contexto.currentLine).toBe(2);
    expect(terminados.contexto.currentLine).toBeNull();
  });

  it('deja monthsAgo en null cuando el evento o el atributo no tienen fecha', () => {
    const { contexto } = construirContextoPermitido(
      casoDeEjemplo({
        eventos: [eventoDeEjemplo({ eventDate: null })],
        atributos: [atributoDeEjemplo({ observedAt: null })],
      }),
      AHORA_DE_EJEMPLO,
    );

    expect(contexto.events[0]?.monthsAgo).toBeNull();
    expect(contexto.attributes[0]?.monthsAgo).toBeNull();
  });

  it('asigna los dataRef en orden de construcción y los enlaza con su fila', () => {
    const { contexto, dataRefs } = construirContextoPermitido(
      casoDeEjemplo({
        biomarcadores: [biomarcadorDeEjemplo()],
        atributos: [atributoDeEjemplo()],
        tratamientosPrevios: [tratamientoPrevioDeEjemplo()],
        eventos: [eventoDeEjemplo()],
      }),
      AHORA_DE_EJEMPLO,
    );

    expect(contexto.diagnosis?.dataRef).toBe('r1');
    expect(contexto.biomarkers[0]?.dataRef).toBe('r2');
    expect(contexto.attributes[0]?.dataRef).toBe('r3');
    expect(contexto.priorTreatments[0]?.dataRef).toBe('r4');
    expect(contexto.events[0]?.dataRef).toBe('r5');
    expect([...dataRefs]).toEqual([
      ['r1', { tabla: 'diagnosis', id: 'dx-1' }],
      ['r2', { tabla: 'biomarker', id: 'bm-1' }],
      ['r3', { tabla: 'clinical_attribute', id: 'at-1' }],
      ['r4', { tabla: 'prior_treatment', id: 'tp-1' }],
      ['r5', { tabla: 'clinical_event', id: 'ev-1' }],
    ]);
  });

  it('envía vacías las listas que el S1 no puebla: notas, tendencias, faltantes y análisis previos', () => {
    const { contexto } = construirContextoPermitido(casoDeEjemplo(), AHORA_DE_EJEMPLO);

    expect(contexto.clinicalNotes).toEqual([]);
    expect(contexto.biomarkerTrends).toEqual([]);
    expect(contexto.missingCriticalData).toEqual([]);
    expect(contexto.priorAnalyses).toEqual([]);
  });

  it('nunca incluye un campo que la fila traiga y la allowlist no nombre', () => {
    const conCampoAjeno = {
      ...diagnosticoDeEjemplo(),
      nombreCompleto: 'Lucía Fernanda Rondón Peña',
      identificacion: '52123456',
      referenciaDeConvenio: 'CONV-TEST-01',
    };

    const { contexto } = construirContextoPermitido(
      casoDeEjemplo({ diagnosticoActivo: conCampoAjeno }),
      AHORA_DE_EJEMPLO,
    );

    const texto = JSON.stringify(contexto);
    for (const ajeno of ['Lucía', '52123456', 'CONV-TEST-01', 'nombreCompleto', 'dx-1']) {
      expect(texto, ajeno).not.toContain(ajeno);
    }
  });
});
