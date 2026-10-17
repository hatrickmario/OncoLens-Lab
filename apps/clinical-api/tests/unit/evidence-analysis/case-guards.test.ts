import { describe, expect, it } from 'vitest';
import {
  TipoCancerNoRegistradoError,
  exigirTipoCancer,
} from '../../../src/modules/evidence-analysis/case-guards.js';
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
