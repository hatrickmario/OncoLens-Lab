import { describe, expect, it } from 'vitest';
import type { Diagnosis } from '../../../../packages/api-contracts/src/types/clinical-api';
import diagnosticoProstata from '../../../../contracts/examples/diagnosis-con-gradings.json';
import fichaDelDoctor from '../../../../contracts/examples/patient-summary-doctor.json';
import {
  cambiosDelDiagnostico,
  erroresDelDiagnostico,
  formularioInicial,
  gradacionCompleta,
} from '../../lib/registro-manual/diagnostico';
import { mensajes } from '../../lib/mensajes';

const mama = fichaDelDoctor.diagnosis as Diagnosis;
const prostata = diagnosticoProstata as Diagnosis;
const { errores } = mensajes().registroManual;

describe('formularioInicial', () => {
  it('precarga los valores vigentes y la gradación de referencia como texto', () => {
    const f = formularioInicial(mama, ['nottingham']);

    expect(f).toMatchObject({
      cancerType: 'mama',
      histology: 'carcinoma ductal infiltrante',
      stagingSystem: 'TNM_8',
      stageValue: 'IIA',
      performanceScale: 'ECOG',
      performanceValue: '1',
      diagnosedAt: '2026-09-01',
    });
    expect(f.gradacion).toMatchObject({ sistema: 'nottingham', nottingham: '2' });
  });

  it('deja todo vacío sin vigente y fija el sistema cuando el catálogo ofrece uno solo', () => {
    const f = formularioInicial(null, ['gleason_isup']);

    expect(f.cancerType).toBe('');
    expect(f.gradacion.sistema).toBe('gleason_isup');
  });

  it('no fija el sistema sin vigente cuando el catálogo ofrece más de uno', () => {
    expect(formularioInicial(null, ['nottingham', 'gleason_isup']).gradacion.sistema).toBe('');
  });
});

describe('cambiosDelDiagnostico', () => {
  it('devuelve un cuerpo vacío cuando no cambió nada respecto del vigente', () => {
    expect(cambiosDelDiagnostico(mama, formularioInicial(mama, ['nottingham']))).toEqual({});
  });

  it('envía solo el campo cambiado y su tipo correcto', () => {
    const f = { ...formularioInicial(mama, ['nottingham']), performanceValue: '2' };

    expect(cambiosDelDiagnostico(mama, f)).toEqual({ performanceValue: 2 });
  });

  it('nunca envía un campo vacío aunque el vigente tuviera valor', () => {
    const f = { ...formularioInicial(mama, ['nottingham']), histology: '  ' };

    expect(cambiosDelDiagnostico(mama, f)).toEqual({});
  });

  it('envía la gradación Nottingham cuando cambia el grado de referencia', () => {
    const base = formularioInicial(mama, ['nottingham']);
    const f = { ...base, gradacion: { ...base.gradacion, nottingham: '3' } };

    expect(cambiosDelDiagnostico(mama, f)).toEqual({
      grading: { gradingSystem: 'nottingham', nottinghamGrade: 3 },
    });
  });

  it('envía los cuatro campos de Gleason sin score ni grupo ISUP cuando cambia un patrón', () => {
    const base = formularioInicial(prostata, ['gleason_isup']);
    const f = { ...base, gradacion: { ...base.gradacion, patronSecundario: '4' } };

    expect(cambiosDelDiagnostico(prostata, f)).toEqual({
      grading: {
        gradingSystem: 'gleason_isup',
        specimenType: 'prostatectomia',
        gradeScope: 'global',
        gleasonPrimaryPattern: 4,
        gleasonSecondaryPattern: 4,
      },
    });
  });

  it('envía todo lo escrito cuando no hay diagnóstico vigente', () => {
    const f = {
      ...formularioInicial(null, ['nottingham']),
      cancerType: 'mama',
      stagingSystem: 'TNM_8',
      stageValue: 'IIA',
      diagnosedAt: '2026-09-01',
    };

    expect(cambiosDelDiagnostico(null, f)).toEqual({
      cancerType: 'mama',
      stagingSystem: 'TNM_8',
      stageValue: 'IIA',
      diagnosedAt: '2026-09-01',
    });
  });
});

describe('gradacionCompleta', () => {
  it('devuelve null cuando falta algún campo de Gleason', () => {
    const base = formularioInicial(prostata, ['gleason_isup']).gradacion;

    expect(gradacionCompleta({ ...base, especimen: '' })).toBeNull();
  });

  it('devuelve null cuando no hay sistema elegido', () => {
    expect(gradacionCompleta(formularioInicial(null, []).gradacion)).toBeNull();
  });
});

describe('erroresDelDiagnostico', () => {
  it('no marca nada con vigente y sin cambios', () => {
    expect(erroresDelDiagnostico(mama, formularioInicial(mama, ['nottingham']))).toEqual({});
  });

  it('exige tipo, sistema y valor de estadio y fecha sin vigente', () => {
    expect(erroresDelDiagnostico(null, formularioInicial(null, ['nottingham']))).toEqual({
      cancerType: errores.obligatorio,
      stagingSystem: errores.obligatorio,
      stageValue: errores.obligatorio,
      diagnosedAt: errores.obligatorio,
    });
  });

  it('marca la gradación cuando está a medias', () => {
    const base = formularioInicial(prostata, ['gleason_isup']);
    const f = { ...base, gradacion: { ...base.gradacion, alcance: '' } };

    expect(erroresDelDiagnostico(prostata, f)).toEqual({ grading: errores.obligatorio });
  });

  it('marca el valor funcional cuando no es un número', () => {
    const f = { ...formularioInicial(mama, ['nottingham']), performanceValue: 'abc' };

    expect(erroresDelDiagnostico(mama, f)).toHaveProperty('performanceValue');
  });
});
