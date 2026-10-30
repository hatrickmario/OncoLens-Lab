import type { PatientAdminSummary } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { IdentityIntegrityError } from '../../infrastructure/crypto/identity-integrity-error.js';
import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';

/**
 * Contador de faltantes SOLO del listado y la búsqueda: no calculan el checklist por fila (decisión Q2, L1D-95 D7b), así
 * que muestran 0 y no un valor inventado. La ficha NO lo usa: su contador sale de `CompletenessService` (US-003). Se
 * retira cuando una historia posterior calcule el checklist por fila.
 */
export const FALTANTES_CRITICOS_POR_AHORA = 0;

/** Marcador de la máscara del documento: cuatro U+2022 (el formato lo fija el contrato, `nationalIdMasked`). */
const MARCADOR_DE_DOCUMENTO = '••••';
const CARACTERES_VISIBLES = 2;
const RELLENO = '0';

/**
 * Máscara del nombre: la inicial de cada palabra en mayúscula seguida de punto ("Lucía Fernanda Rondón Peña" →
 * "L. F. R. P."). No conserva ninguna palabra completa ni su longitud (RN-10, US-048 AC-7).
 */
export function enmascararNombre(nombreCompleto: string): string {
  return nombreCompleto
    .split(/\s+/)
    .filter((palabra) => palabra !== '')
    .map((palabra) => `${inicialEnMayuscula(palabra)}.`)
    .join(' ');
}

/**
 * Primer carácter (code point) de la palabra en mayúscula. Si la mayúscula ocupa más de un carácter ("ß" → "SS") se conserva
 * la inicial original: la máscara es siempre un carácter más el punto, como exige el contrato (`pattern` de `fullNameMasked`).
 */
function inicialEnMayuscula(palabra: string): string {
  const inicial = Array.from(palabra)[0] ?? '';
  const mayuscula = inicial.toLocaleUpperCase('es');
  return Array.from(mayuscula).length === 1 ? mayuscula : inicial;
}

/**
 * Máscara del documento de LONGITUD FIJA: cuatro U+2022, un espacio y los 2 últimos caracteres alfanuméricos del número
 * normalizado, para todo `idType` ("1234567" → "•••• 67"; "SINT-0000001" → "•••• 01"). No revela la longitud del
 * documento; si tuviera menos de 2 caracteres se rellena a la izquierda (RN-10, US-048 AC-7).
 */
export function enmascararDocumento(numeroDeDocumento: string): string {
  // Normalización PROPIA de la máscara: `normalizarNumeroDeDocumento` define el índice ciego y está congelado.
  const visibles = numeroDeDocumento
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(-CARACTERES_VISIBLES)
    .padStart(CARACTERES_VISIBLES, RELLENO);
  return `${MARCADOR_DE_DOCUMENTO} ${visibles}`;
}

/** `false` significa fuera del alcance del piloto; sin tipo de cáncer (sin diagnóstico vigente) no hay nada que analizar. */
export function cancerTypeHabilitado(
  cancerType: string | null,
  tiposHabilitados: TiposDeCancerHabilitados,
): boolean {
  return cancerType !== null && tiposHabilitados.estaHabilitado(cancerType);
}

/** Un paciente sin identidad guardada es una violación de integridad (L1D-200), no un dato opcional. */
export function exigirIdentidad<T>(identidad: T | undefined): T {
  if (identidad === undefined) throw new IdentityIntegrityError();
  return identidad;
}

/** Datos no clínicos de un paciente con los que se arma el resumen del admin. */
export interface BaseDelResumenAdmin {
  readonly id: string;
  readonly dataOrigin: PatientAdminSummary['dataOrigin'];
  readonly lifecycleStatus: PatientAdminSummary['lifecycleStatus'];
  readonly registeredAt: Date;
}

/** Resumen del admin (mínimo privilegio): sin nombre ni datos clínicos; del documento, solo su máscara. */
export function comoResumenAdmin(
  paciente: BaseDelResumenAdmin,
  identificacion: { idType: PatientAdminSummary['idType']; numeroDeDocumento: string },
): PatientAdminSummary {
  return {
    view: 'admin',
    id: paciente.id,
    idType: identificacion.idType,
    nationalIdMasked: enmascararDocumento(identificacion.numeroDeDocumento),
    dataOrigin: paciente.dataOrigin,
    lifecycleStatus: paciente.lifecycleStatus,
    registeredAt: paciente.registeredAt.toISOString(),
  };
}
