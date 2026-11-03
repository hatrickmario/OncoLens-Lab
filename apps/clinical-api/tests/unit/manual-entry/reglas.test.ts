import { describe, expect, it } from 'vitest';
import { pacienteAdmiteRegistros } from '../../../src/modules/compartido/paciente-activo.js';
import {
  derivarGleason,
  elegirGradacionDeReferencia,
  fusionarCorreccion,
  textoDeGrado,
  validarCoherenciaGleason,
} from '../../../src/modules/manual-entry/manual-entry.reglas.js';
import type {
  DatosDelDiagnostico,
  GradacionGuardada,
} from '../../../src/modules/manual-entry/ports.js';

const VIGENTE: DatosDelDiagnostico = {
  cancerType: 'mama',
  icd10Code: 'C50.9',
  mappingStatus: 'mapeado',
  histology: 'carcinoma ductal',
  histologyCode: null,
  grade: null,
  stagingSystem: 'TNM_8',
  stageValue: 'IIA',
  performanceScale: 'ECOG',
  performanceValue: 1,
  diagnosedAt: '2026-05-02',
};

function gradacion(resto: Partial<GradacionGuardada> = {}): GradacionGuardada {
  return {
    id: 'g1',
    gradingSystem: 'gleason_isup',
    specimenType: 'biopsia',
    gradeScope: 'peor',
    gleasonPrimaryPattern: 4,
    gleasonSecondaryPattern: 3,
    gleasonScore: 7,
    isupGradeGroup: 3,
    nottinghamGrade: null,
    isReference: false,
    entryMethod: 'manual',
    extractionConfidence: 'n_a',
    extractionScore: null,
    reviewStatus: 'verificado',
    sourceDocumentId: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    ...resto,
  };
}

describe('derivarGleason', () => {
  it.each([
    [3, 3, 6, 1],
    [3, 4, 7, 2],
    [4, 3, 7, 3],
    [4, 4, 8, 4],
    [4, 5, 9, 5],
    [5, 5, 10, 5],
  ])(
    'deriva el puntaje y el grupo ISUP de %i+%i como %i e ISUP %i',
    (primario, secundario, puntaje, grupoIsup) => {
      expect(derivarGleason(primario, secundario)).toEqual({ puntaje, grupoIsup });
    },
  );
});

describe('validarCoherenciaGleason', () => {
  it('devuelve null cuando no se envía puntaje ni grupo', () => {
    expect(validarCoherenciaGleason({ patronPrimario: 4, patronSecundario: 3 })).toBeNull();
  });

  it('devuelve null cuando puntaje y grupo cuadran con los patrones', () => {
    expect(
      validarCoherenciaGleason({
        patronPrimario: 4,
        patronSecundario: 3,
        puntaje: 7,
        grupoIsup: 3,
      }),
    ).toBeNull();
  });

  it('nombra gleasonScore cuando 4+3 llega con puntaje 8', () => {
    expect(validarCoherenciaGleason({ patronPrimario: 4, patronSecundario: 3, puntaje: 8 })).toBe(
      'gleasonScore',
    );
  });

  it('nombra isupGradeGroup cuando 3+4 llega con grupo 3', () => {
    expect(validarCoherenciaGleason({ patronPrimario: 3, patronSecundario: 4, grupoIsup: 3 })).toBe(
      'isupGradeGroup',
    );
  });
});

describe('textoDeGrado', () => {
  it('deriva el texto de Gleason con puntaje y grupo ISUP', () => {
    expect(
      textoDeGrado({
        gradingSystem: 'gleason_isup',
        gleasonPrimaryPattern: 4,
        gleasonSecondaryPattern: 3,
        nottinghamGrade: null,
      }),
    ).toBe('Gleason 4+3=7 · ISUP 3');
  });

  it('deriva el texto de Nottingham con el grado', () => {
    expect(
      textoDeGrado({
        gradingSystem: 'nottingham',
        gleasonPrimaryPattern: null,
        gleasonSecondaryPattern: null,
        nottinghamGrade: 2,
      }),
    ).toBe('Nottingham grado 2');
  });
});

describe('elegirGradacionDeReferencia', () => {
  it('devuelve undefined cuando no hay gradaciones', () => {
    expect(elegirGradacionDeReferencia([])).toBeUndefined();
  });

  it('devuelve undefined cuando ninguna está verificada', () => {
    expect(
      elegirGradacionDeReferencia([gradacion({ reviewStatus: 'requiere_revision' })]),
    ).toBeUndefined();
  });

  it('elige la más reciente verificada cuando son del mismo rango (mama)', () => {
    const vieja = gradacion({
      id: 'vieja',
      gradingSystem: 'nottingham',
      specimenType: null,
      gradeScope: null,
    });
    const nueva = gradacion({
      id: 'nueva',
      gradingSystem: 'nottingham',
      specimenType: null,
      gradeScope: null,
      createdAt: new Date('2026-10-16T00:00:00.000Z'),
    });

    expect(elegirGradacionDeReferencia([vieja, nueva])?.id).toBe('nueva');
  });

  it('prefiere la prostatectomía global a una biopsia más reciente', () => {
    const prostatectomia = gradacion({
      id: 'global',
      specimenType: 'prostatectomia',
      gradeScope: 'global',
    });
    const biopsia = gradacion({
      id: 'biopsia',
      createdAt: new Date('2026-10-16T00:00:00.000Z'),
    });

    expect(elegirGradacionDeReferencia([biopsia, prostatectomia])?.id).toBe('global');
  });

  it('prefiere la biopsia «peor» a una de núcleo o sitio más reciente cuando no hay prostatectomía global', () => {
    const peor = gradacion({ id: 'peor' });
    const nucleo = gradacion({
      id: 'nucleo',
      gradeScope: 'nucleo_sitio',
      createdAt: new Date('2026-10-16T00:00:00.000Z'),
    });

    expect(elegirGradacionDeReferencia([nucleo, peor])?.id).toBe('peor');
  });

  it('desempata por id ascendente cuando coinciden rango y fecha', () => {
    const b = gradacion({ id: 'b' });
    const a = gradacion({ id: 'a' });

    expect(elegirGradacionDeReferencia([b, a])?.id).toBe('a');
  });
});

describe('fusionarCorreccion', () => {
  it('copia todos los valores del vigente cuando el cuerpo no envía ninguno', () => {
    expect(fusionarCorreccion(VIGENTE, {})).toEqual(VIGENTE);
  });

  it('deja ganar los campos enviados y copia el resto', () => {
    const fusionado = fusionarCorreccion(VIGENTE, { stageValue: 'IIIB', performanceValue: 3 });

    expect(fusionado).toEqual({ ...VIGENTE, stageValue: 'IIIB', performanceValue: 3 });
  });

  it('borra la histología cuando se envía null y la conserva cuando no se envía', () => {
    expect(fusionarCorreccion(VIGENTE, { histology: null }).histology).toBeNull();
    expect(fusionarCorreccion(VIGENTE, {}).histology).toBe('carcinoma ductal');
  });
});

describe('pacienteAdmiteRegistros', () => {
  it('admite registros cuando el paciente está activo', () => {
    expect(pacienteAdmiteRegistros('activo')).toBe(true);
  });

  it('no admite registros cuando el paciente está egresado [RN-17]', () => {
    expect(pacienteAdmiteRegistros('egresado')).toBe(false);
  });
});
