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

/**
 * La marca vigente es la más reciente por `recorded_at` y solo cuenta si es un `registrado`; una revocación posterior
 * equivale a no tener marca (RN-15, FR-16). En un empate de instante gana el registro: ante la duda, la IA no se usa.
 */
export function ultimaMarcaVigente(marcas: readonly MarcaDeOptOut[]): MarcaDeOptOut | null {
  const masReciente = marcas.reduce<MarcaDeOptOut | null>((actual, candidata) => {
    if (actual === null) return candidata;
    const diferencia = candidata.recordedAt.getTime() - actual.recordedAt.getTime();
    if (diferencia > 0) return candidata;
    return diferencia === 0 && candidata.action === 'registrado' ? candidata : actual;
  }, null);
  return masReciente?.action === 'registrado' ? masReciente : null;
}

const ORIGENES_REALES: readonly OrigenDelPaciente[] = ['real_anonimizado', 'real_identificado'];

/** Un paciente real sin convenio no admite IA: sin convenio no se presume consentimiento (RN-15). */
export function consentimientoPresumible(paciente: PacienteParaConsentimiento): boolean {
  if (!ORIGENES_REALES.includes(paciente.dataOrigin)) return true;
  return (paciente.agreementReference ?? '').trim() !== '';
}
