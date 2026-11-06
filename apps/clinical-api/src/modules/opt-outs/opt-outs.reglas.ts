import type { OrigenDelPaciente } from '../patients/patients.repository.js';

/** Una marca de `analisis_ia` como la lee el guardia: solo lo que decide; la referencia y el motivo nunca salen del repository. */
export interface MarcaDeOptOut {
  readonly action: 'registrado' | 'revocado';
  readonly recordedAt: Date;
}

/** Lo que el guardia necesita del paciente para la regla «real sin convenio». */
export interface PacienteParaConsentimiento {
  readonly dataOrigin: OrigenDelPaciente;
  readonly agreementReference: string | null;
}

/** `opt_out` y `sin_convenio` bloquean la generación con IA; el motivo solo se registra en el log, nunca se responde. */
export type ConsentimientoIA = 'disponible' | 'opt_out' | 'sin_convenio';

/** La marca vigente es la más reciente por `recorded_at`; `revocado` equivale a no tener marca (RN-15, FR-16). */
export function ultimaMarcaVigente(_marcas: readonly MarcaDeOptOut[]): MarcaDeOptOut | null {
  throw new Error('no implementado');
}

/** Un paciente real sin convenio no admite IA: sin convenio no se presume consentimiento (RN-15). */
export function consentimientoPresumible(_paciente: PacienteParaConsentimiento): boolean {
  throw new Error('no implementado');
}
