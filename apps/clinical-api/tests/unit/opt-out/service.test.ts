import { describe, expect, it } from 'vitest';
import type { OptOutRepository } from '../../../src/modules/opt-outs/opt-outs.repository.js';
import type {
  MarcaDeOptOut,
  PacienteParaConsentimiento,
} from '../../../src/modules/opt-outs/opt-outs.reglas.js';
import { crearOptOutService } from '../../../src/modules/opt-outs/opt-outs.service.js';

const PACIENTE = '00000000-0000-4000-8000-000000000001';

/** Fake que cumple el contrato del repository real: `null` si el paciente no existe, marcas en cualquier orden. */
function repositorioFalso(
  paciente: PacienteParaConsentimiento | null,
  marcas: MarcaDeOptOut[] = [],
): OptOutRepository {
  return {
    marcasDeAnalisisIa: () => Promise.resolve(marcas),
    pacienteParaConsentimiento: () => Promise.resolve(paciente),
  };
}

const SINTETICO: PacienteParaConsentimiento = { dataOrigin: 'sintetico', agreementReference: null };
const REGISTRADA: MarcaDeOptOut = {
  action: 'registrado',
  recordedAt: new Date('2026-10-10T09:00:00Z'),
};

describe('OptOutService', () => {
  it('devuelve null cuando el paciente no existe', async () => {
    const servicio = crearOptOutService({ optOuts: repositorioFalso(null) });

    expect(await servicio.consentimientoIA(PACIENTE)).toBeNull();
  });

  it('devuelve disponible cuando el paciente no tiene marcas', async () => {
    const servicio = crearOptOutService({ optOuts: repositorioFalso(SINTETICO) });

    expect(await servicio.consentimientoIA(PACIENTE)).toBe('disponible');
  });

  it('devuelve opt_out cuando la marca vigente es un registro', async () => {
    const servicio = crearOptOutService({ optOuts: repositorioFalso(SINTETICO, [REGISTRADA]) });

    expect(await servicio.consentimientoIA(PACIENTE)).toBe('opt_out');
  });

  it('devuelve sin_convenio cuando el paciente real no tiene convenio, aunque no tenga marcas', async () => {
    const real: PacienteParaConsentimiento = {
      dataOrigin: 'real_identificado',
      agreementReference: null,
    };
    const servicio = crearOptOutService({ optOuts: repositorioFalso(real) });

    expect(await servicio.consentimientoIA(PACIENTE)).toBe('sin_convenio');
  });
});
