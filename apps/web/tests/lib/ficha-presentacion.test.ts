import { describe, expect, it } from 'vitest';
import type {
  Diagnosis,
  DiagnosisGrading,
  PatientSummary,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { contarSinVerificar } from '../../lib/ficha/contar-sin-verificar';
import {
  describirGradacion,
  formatearFecha,
  textoDeConfianza,
  textoDeAviso,
} from '../../lib/ficha/presentacion';
import {
  biomarcadorSinVerificar,
  diagnosticoConGradaciones,
  fichaDelDoctor,
} from '../support/ficha-simulado';

const ficha = fichaDelDoctor as unknown as PatientSummary;
const diagnostico = diagnosticoConGradaciones as unknown as Diagnosis;
const prostatectomia = diagnostico.gradings[0] as DiagnosisGrading;
const nottingham = ficha.diagnosis!.gradings[0] as DiagnosisGrading;

describe('formatearFecha', () => {
  it('devuelve dd/mm/aaaa sin desplazar el día cuando recibe una fecha ISO', () => {
    expect(formatearFecha('2026-09-01')).toBe('01/09/2026');
    expect(formatearFecha('2026-09-05T00:00:00Z')).toBe('05/09/2026');
  });
});

describe('describirGradacion', () => {
  it('antepone espécimen y alcance a la gradación de Gleason cuando los tiene', () => {
    expect(describirGradacion(prostatectomia)).toBe(
      'Prostatectomía · Global: Gleason 4+3=7 · ISUP 3',
    );
  });

  it('devuelve solo el valor cuando no hay espécimen ni alcance', () => {
    expect(describirGradacion(nottingham)).toBe('Nottingham grado 2');
  });

  it('devuelve No registrado cuando a Gleason le falta algún campo, sin pintar null', () => {
    const incompleta = { ...prostatectomia, gleasonScore: null };

    expect(describirGradacion(incompleta)).toBe('Prostatectomía · Global: No registrado');
  });

  it('devuelve No registrado cuando a Nottingham le falta el grado', () => {
    expect(describirGradacion({ ...nottingham, nottinghamGrade: null })).toBe('No registrado');
  });

  it('no renderiza como Gleason un sistema de gradación desconocido', () => {
    const desconocida = { ...prostatectomia, gradingSystem: 'otro' } as unknown as DiagnosisGrading;

    expect(describirGradacion(desconocida)).not.toContain('Gleason');
    expect(describirGradacion(desconocida)).toContain('No registrado');
  });
});

describe('textoDeConfianza', () => {
  it('rotula la confianza de extracción en texto', () => {
    expect(textoDeConfianza('alta')).toBe('Confianza de extracción: alta');
    expect(textoDeConfianza('n_a')).toBe('Confianza de extracción: no aplica');
  });

  it('devuelve No registrado cuando la confianza falta', () => {
    expect(textoDeConfianza(null)).toBe('Confianza de extracción: No registrado');
    expect(textoDeConfianza(undefined)).toBe('Confianza de extracción: No registrado');
  });
});

describe('contarSinVerificar', () => {
  it('cuenta solo los valores auto_aceptado del diagnóstico, sus gradaciones y los biomarcadores', () => {
    expect(contarSinVerificar(ficha)).toBe(1);
    const con2 = {
      ...ficha,
      recentBiomarkers: [
        ...ficha.recentBiomarkers,
        biomarcadorSinVerificar as unknown as PatientSummary['recentBiomarkers'][number],
      ],
    };
    expect(contarSinVerificar(con2)).toBe(2);
  });

  it('devuelve 0 cuando no hay diagnóstico ni biomarcadores', () => {
    expect(contarSinVerificar({ diagnosis: null, recentBiomarkers: [] })).toBe(0);
  });
});

describe('textoDeAviso', () => {
  it('usa el singular con 1 y el plural con más', () => {
    expect(textoDeAviso(1, 'sinVerificarUno')).toBe(
      '1 dato sin verificar · no bloquea el análisis',
    );
    expect(textoDeAviso(4, 'porRevisarUno')).toBe('4 datos por revisar · no bloquean el análisis');
  });
});
