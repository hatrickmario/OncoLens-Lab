import type { Registrar } from '../../../infrastructure/logger.js';
import type {
  ContextDeidentifier,
  PatientIdentityReader,
  PiiDetectorFactory,
  PseudonymGenerator,
} from '../ports.js';

export interface DependenciasDelDesidentificador {
  identidades: PatientIdentityReader;
  detectores: PiiDetectorFactory;
  pseudonimos: PseudonymGenerator;
  /** `APP_ENV`: la guarda de entorno sintético solo admite `local` y `test`. */
  appEnv: string | undefined;
  registrar: Registrar;
}

/** Adaptador definitivo de `ContextDeidentifier` (RN-10, RN-11). */
export function crearContextDeidentifier(
  dependencias: DependenciasDelDesidentificador,
): ContextDeidentifier {
  void dependencias;
  return {
    desidentificar() {
      throw new Error('no implementado');
    },
  };
}
