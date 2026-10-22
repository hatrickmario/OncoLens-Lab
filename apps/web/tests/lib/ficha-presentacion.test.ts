import { describe, expect, it } from 'vitest';
import { contarSinVerificar } from '../../lib/ficha/contar-sin-verificar';
import { describirGradacion, formatearFecha, textoDeAviso } from '../../lib/ficha/presentacion';
import {
  biomarcadorSinVerificar,
  diagnosticoConGradaciones,
  fichaDelDoctor,
} from '../support/ficha-simulado';

const [prostatectomia] = diagnosticoConGradaciones.gradings;

describe('formatearFecha', () => {
  it('devuelve dd/mm/aaaa sin desplazar el día cuando recibe una fecha ISO', () => {
    expect(formatearFecha('2026-09-01')).toBe('01/09/2026');
    expect(formatearFecha('2026-09-05T00:00:00Z')).toBe('05/09/2026');
  });
});

describe('describirGradacion', () => {
  it('antepone espécimen y alcance a la gradación de Gleason cuando los tiene', () => {
    expect(describirGradacion(prostatectomia as never)).toBe(
      'Prostatectomía · Global: Gleason 4+3=7 · ISUP 3',
    );
  });

  it('devuelve solo el valor cuando no hay espécimen ni alcance', () => {
    const [nottingham] = fichaDelDoctor.diagnosis.gradings;
    expect(describirGradacion(nottingham as never)).toBe('Nottingham grado 2');
  });
});

describe('contarSinVerificar', () => {
  it('cuenta solo los valores auto_aceptado del diagnóstico, sus gradaciones y los biomarcadores', () => {
    expect(contarSinVerificar(fichaDelDoctor as never)).toBe(1);
    const con2 = {
      ...fichaDelDoctor,
      recentBiomarkers: [...fichaDelDoctor.recentBiomarkers, biomarcadorSinVerificar],
    };
    expect(contarSinVerificar(con2 as never)).toBe(2);
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
