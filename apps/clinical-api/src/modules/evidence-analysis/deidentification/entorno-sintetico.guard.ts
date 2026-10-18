import type { OrigenDeDatos } from '../ports.js';

export type MotivoDeRechazo = 'data_origin' | 'app_env';

/** El análisis no puede salir hacia la IA con este caso o en este entorno (falla cerrado, RN-11, RN-13). */
export class EntornoNoSintetico extends Error {
  constructor(readonly motivo: MotivoDeRechazo) {
    super('Entorno no sintético');
    this.name = 'EntornoNoSintetico';
  }
}

/**
 * Entornos en los que un caso puede salir hacia la IA mientras no exista el gate G-Piloto. No es configuración: es la
 * frontera de seguridad `[S1 resp. 14d]` y la retira US-143 (`preflight real-data`), no este change.
 */
const ENTORNOS_DE_PRUEBA: ReadonlySet<string> = new Set(['local', 'test']);

/** Solo `data_origin = sintetico` en `APP_ENV` ∈ {local, test}; `APP_ENV` ausente también rechaza. */
export function exigirEntornoSintetico(
  dataOrigin: OrigenDeDatos,
  appEnv: string | undefined,
): void {
  if (dataOrigin !== 'sintetico') throw new EntornoNoSintetico('data_origin');
  if (appEnv === undefined || !ENTORNOS_DE_PRUEBA.has(appEnv)) {
    throw new EntornoNoSintetico('app_env');
  }
}
