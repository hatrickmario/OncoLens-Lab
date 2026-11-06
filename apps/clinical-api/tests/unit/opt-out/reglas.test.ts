import { describe, expect, it } from 'vitest';
import {
  consentimientoPresumible,
  ultimaMarcaVigente,
  type MarcaDeOptOut,
} from '../../../src/modules/opt-outs/opt-outs.reglas.js';

const marca = (action: MarcaDeOptOut['action'], instante: string): MarcaDeOptOut => ({
  action,
  recordedAt: new Date(instante),
});

describe('ultimaMarcaVigente', () => {
  it('devuelve null cuando el paciente no tiene marcas', () => {
    expect(ultimaMarcaVigente([])).toBeNull();
  });

  it('devuelve la marca registrada cuando es la única', () => {
    const registrada = marca('registrado', '2026-10-10T09:00:00Z');

    expect(ultimaMarcaVigente([registrada])).toBe(registrada);
  });

  it('devuelve null cuando la marca más reciente es una revocación', () => {
    const marcas = [
      marca('registrado', '2026-10-10T09:00:00Z'),
      marca('revocado', '2026-10-12T09:00:00Z'),
    ];

    expect(ultimaMarcaVigente(marcas)).toBeNull();
  });

  it('devuelve la marca registrada cuando es posterior a una revocación', () => {
    const posterior = marca('registrado', '2026-10-14T09:00:00Z');
    const marcas = [marca('revocado', '2026-10-12T09:00:00Z'), posterior];

    expect(ultimaMarcaVigente(marcas)).toBe(posterior);
  });

  it('decide por recordedAt y no por el orden de entrada', () => {
    const marcas = [
      marca('revocado', '2026-10-12T09:00:00Z'),
      marca('registrado', '2026-10-10T09:00:00Z'),
    ];

    expect(ultimaMarcaVigente(marcas)).toBeNull();
  });

  it('prefiere la marca registrada cuando registro y revocación comparten instante', () => {
    const registrada = marca('registrado', '2026-10-12T09:00:00Z');
    const marcas = [marca('revocado', '2026-10-12T09:00:00Z'), registrada];

    expect(ultimaMarcaVigente(marcas)).toBe(registrada);
  });
});

describe('consentimientoPresumible', () => {
  it('es verdadero para un paciente sintético sin convenio', () => {
    expect(consentimientoPresumible({ dataOrigin: 'sintetico', agreementReference: null })).toBe(
      true,
    );
  });

  it.each(['real_anonimizado', 'real_identificado'] as const)(
    'es falso para un paciente %s sin convenio',
    (dataOrigin) => {
      expect(consentimientoPresumible({ dataOrigin, agreementReference: null })).toBe(false);
    },
  );

  it('es falso cuando la referencia de convenio de un paciente real está en blanco', () => {
    expect(
      consentimientoPresumible({ dataOrigin: 'real_anonimizado', agreementReference: '  ' }),
    ).toBe(false);
  });

  it('es verdadero para un paciente real con convenio registrado', () => {
    expect(
      consentimientoPresumible({
        dataOrigin: 'real_identificado',
        agreementReference: 'CONV-TEST-01',
      }),
    ).toBe(true);
  });
});
