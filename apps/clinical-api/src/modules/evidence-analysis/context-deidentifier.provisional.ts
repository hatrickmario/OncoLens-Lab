import type { ContextDeidentifier, PseudonymGenerator } from './ports.js';
import {
  EntornoNoSintetico,
  exigirEntornoSintetico,
} from './deidentification/entorno-sintetico.guard.js';

// La guarda vive ahora en `deidentification/` (L1D-203, decisión 9): se conserva hasta G-Piloto y este alias se va con el adaptador.
export { EntornoNoSintetico as DesidentificacionProvisionalRechazada, exigirEntornoSintetico };

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
