import type { ContextDeidentifier, OrigenDeDatos, PseudonymGenerator } from './ports.js';

export type MotivoDeRechazo = 'data_origin' | 'app_env';

/** El desidentificador provisional no se puede usar con este caso o en este entorno (falla cerrado, RN-11, RN-13). */
export class DesidentificacionProvisionalRechazada extends Error {
  constructor(readonly motivo: MotivoDeRechazo) {
    super('Desidentificación provisional rechazada');
    this.name = 'DesidentificacionProvisionalRechazada';
  }
}

/** Solo `data_origin = sintetico` en `APP_ENV` ∈ {local, test}; `APP_ENV` ausente también rechaza. */
export function exigirEntornoSintetico(
  _dataOrigin: OrigenDeDatos,
  _appEnv: string | undefined,
): void {
  throw new Error('no implementado');
}

export function crearDesidentificadorProvisional(_dependencias: {
  pseudonimos: PseudonymGenerator;
  appEnv: string | undefined;
}): ContextDeidentifier {
  return {
    desidentificar() {
      throw new Error('no implementado');
    },
  };
}
