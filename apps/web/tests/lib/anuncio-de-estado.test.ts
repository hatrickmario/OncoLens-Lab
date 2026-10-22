import { describe, expect, it } from 'vitest';
import { anunciarEstado } from '../../lib/evidence/anuncio-de-estado';
import { mensajes } from '../../lib/mensajes';
import { conEvidencia, sinEvidencia, tipoNoHabilitado } from '../support/msw/evidence-analyses';

const { estado } = mensajes().evidence;
const ok = (analisis: object) => ({ tipo: 'ok' as const, analisis: analisis as never });

describe('anunciarEstado', () => {
  it('anuncia el número de opciones descritas cuando el resultado trae opciones', () => {
    const una = anunciarEstado(
      ok({ ...conEvidencia, evidenceOptions: conEvidencia.evidenceOptions.slice(0, 1) }),
    );
    expect(una).toBe(estado.listoUna);
  });

  it('anuncia sin evidencia cuando el estado es sin_evidencia', () => {
    expect(anunciarEstado(ok(sinEvidencia))).toBe(estado.sinEvidencia);
  });

  it('devuelve vacío cuando el estado es tipo_no_habilitado, porque el aviso de alcance es la región de estado', () => {
    expect(anunciarEstado(ok(tipoNoHabilitado))).toBe('');
  });

  it('devuelve vacío cuando el panel está inactivo', () => {
    expect(anunciarEstado({ tipo: 'inactivo' })).toBe('');
  });
});
