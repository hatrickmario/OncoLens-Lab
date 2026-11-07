import type { OptOutRepository } from './opt-outs.repository.js';
import {
  consentimientoPresumible,
  ultimaMarcaVigente,
  type ConsentimientoIA,
} from './opt-outs.reglas.js';

export interface OptOutService {
  /**
   * Si la IA puede generar sobre el paciente (RN-15): una sola regla para el guardia de las rutas `generaIA` y para
   * `aiAnalysisAvailable` de la ficha. `null` si el paciente no existe (el handler responde su 404).
   */
  consentimientoIA(patientId: string): Promise<ConsentimientoIA | null>;
}

export interface DependenciasDelServicioDeOptOut {
  optOuts: OptOutRepository;
}

export function crearOptOutService(dependencias: DependenciasDelServicioDeOptOut): OptOutService {
  const { optOuts } = dependencias;
  return {
    async consentimientoIA(patientId) {
      const paciente = await optOuts.pacienteParaConsentimiento(patientId);
      if (paciente === null) return null;
      if (!consentimientoPresumible(paciente)) return 'sin_convenio';
      const vigente = ultimaMarcaVigente(await optOuts.marcasDeAnalisisIa(patientId));
      return vigente === null ? 'disponible' : 'opt_out';
    },
  };
}
