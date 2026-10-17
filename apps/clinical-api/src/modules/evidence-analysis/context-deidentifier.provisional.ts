import type { ContextDeidentifier, OrigenDeDatos, PseudonymGenerator } from './ports.js';

export type MotivoDeRechazo = 'data_origin' | 'app_env';

/** El desidentificador provisional no se puede usar con este caso o en este entorno (falla cerrado, RN-11, RN-13). */
export class DesidentificacionProvisionalRechazada extends Error {
  constructor(readonly motivo: MotivoDeRechazo) {
    super('Desidentificación provisional rechazada');
    this.name = 'DesidentificacionProvisionalRechazada';
  }
}

/**
 * Entornos en los que la pregunta sin enmascarar puede salir hacia la IA. No es configuración: es la frontera de
 * seguridad del adaptador provisional (`[S1 resp. 14d]`) y la elimina L1D-203 junto con el adaptador.
 */
const ENTORNOS_DE_PRUEBA: ReadonlySet<string> = new Set(['local', 'test']);

/** Solo `data_origin = sintetico` en `APP_ENV` ∈ {local, test}; `APP_ENV` ausente también rechaza. */
export function exigirEntornoSintetico(
  dataOrigin: OrigenDeDatos,
  appEnv: string | undefined,
): void {
  if (dataOrigin !== 'sintetico') throw new DesidentificacionProvisionalRechazada('data_origin');
  if (appEnv === undefined || !ENTORNOS_DE_PRUEBA.has(appEnv)) {
    throw new DesidentificacionProvisionalRechazada('app_env');
  }
}

/**
 * Adaptador PROVISIONAL de `ContextDeidentifier` (hasta L1D-203): asigna el seudónimo de la consulta y no enmascara la
 * pregunta ni el texto libre. Por eso falla cerrado fuera de datos sintéticos y de `APP_ENV` ∈ {local, test}.
 */
export function crearDesidentificadorProvisional(dependencias: {
  pseudonimos: PseudonymGenerator;
  appEnv: string | undefined;
}): ContextDeidentifier {
  const { pseudonimos, appEnv } = dependencias;
  return {
    async desidentificar({ contexto, query, dataOrigin }) {
      exigirEntornoSintetico(dataOrigin, appEnv);
      return { clinicalContext: { pseudoPatientId: pseudonimos.nuevo(), ...contexto }, query };
    },
  };
}
