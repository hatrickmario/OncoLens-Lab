import { idsDePacientesDelSeed } from './reglas.js';

/** La base no es la de test con datos sintéticos (RN-13): el motivo nombra la condición, nunca ids ni datos. */
export class BaseNoSinteticaError extends Error {
  constructor(motivo: string) {
    super(`la preparación no corre: ${motivo}`);
    this.name = 'BaseNoSinteticaError';
  }
}

interface ConsultorDePacientes {
  consultar(sql: string): Promise<{ rows: unknown[] }>;
}

interface FilaDePaciente {
  id: string;
  data_origin: string;
}

/**
 * RN-13: además de `assertSeedPermitido` (entorno), la base debe ser la de test con el seed sintético: tiene pacientes, todos
 * `sintetico` y todos del seed. `APP_ENV` por sí solo no basta: una base con otros datos puede correr con un entorno
 * permitido. Se comprueba ANTES de abrir las claves de identidad.
 */
export async function exigirBaseDeTestSintetica(base: ConsultorDePacientes): Promise<void> {
  const { rows } = await base.consultar('SELECT id, data_origin FROM clinical.patient');
  const pacientes = rows as FilaDePaciente[];
  if (pacientes.length === 0) {
    throw new BaseNoSinteticaError('la base no tiene los pacientes del seed sintético');
  }
  const delSeed = idsDePacientesDelSeed();
  if (pacientes.some((paciente) => paciente.data_origin !== 'sintetico')) {
    throw new BaseNoSinteticaError('la base contiene un paciente que no es sintético');
  }
  if (pacientes.some((paciente) => !delSeed.has(paciente.id))) {
    throw new BaseNoSinteticaError('la base contiene un paciente que no es del seed sintético');
  }
}
