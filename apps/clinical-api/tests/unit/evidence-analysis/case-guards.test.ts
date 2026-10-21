import { describe, expect, it } from 'vitest';
import {
  TipoCancerNoRegistradoError,
  exigirTipoCancer,
  exigirTipoHabilitado,
} from '../../../src/modules/evidence-analysis/case-guards.js';
import { crearTiposHabilitados } from '../../../src/modules/evidence-analysis/tipos-habilitados.js';
import { diagnosticoDeEjemplo } from './casos.js';

describe('exigirTipoCancer', () => {
  it('rechaza con TipoCancerNoRegistradoError cuando el caso no tiene diagnóstico activo', () => {
    expect(() => exigirTipoCancer({ diagnosticoActivo: null })).toThrow(
      TipoCancerNoRegistradoError,
    );
  });

  it('deja pasar el caso cuando tiene un diagnóstico activo', () => {
    expect(() => exigirTipoCancer({ diagnosticoActivo: diagnosticoDeEjemplo() })).not.toThrow();
  });
});

describe('exigirTipoHabilitado', () => {
  const caso = { diagnosticoActivo: diagnosticoDeEjemplo({ cancerType: 'prostata' }) };

  it('devuelve tipo_no_habilitado, sin lanzar, cuando el tipo del diagnóstico activo no está en la lista', () => {
    expect(exigirTipoHabilitado(caso, crearTiposHabilitados(['mama']))).toBe('tipo_no_habilitado');
  });

  it('devuelve habilitado cuando el tipo del diagnóstico activo está en la lista', () => {
    expect(exigirTipoHabilitado(caso, crearTiposHabilitados(['mama', 'prostata']))).toBe(
      'habilitado',
    );
  });

  it('devuelve tipo_no_habilitado cuando el caso no tiene diagnóstico activo (sin tipo no hay nada habilitado)', () => {
    expect(exigirTipoHabilitado({ diagnosticoActivo: null }, crearTiposHabilitados(['mama']))).toBe(
      'tipo_no_habilitado',
    );
  });
});
