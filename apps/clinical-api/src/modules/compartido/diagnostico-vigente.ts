/** Lo único que la regla necesita saber de un diagnóstico: su `id` y su fecha (`diagnosed_at`, ISO `YYYY-MM-DD`). */
export interface DatosDeVigencia {
  readonly id: string;
  /** `null` = sin fecha confiable: pierde frente a cualquier diagnóstico con fecha. */
  readonly fecha: string | null;
}

/** Orden por unidades de código, igual en toda máquina (fechas ISO e ids): sin depender del `locale`. */
function compararTexto(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * REGLA ÚNICA del «diagnóstico vigente» (D3 de la ficha, D4 del checklist): entre los diagnósticos candidatos (la
 * BD no garantiza un solo activo por paciente: `diagnosis_patient_id_is_active_idx` no es único), el de `diagnosed_at`
 * más reciente; el empate lo desempata el `id` ascendente. Negativo si `a` es más vigente que `b`.
 */
export function compararVigencia(a: DatosDeVigencia, b: DatosDeVigencia): number {
  return compararTexto(b.fecha ?? '', a.fecha ?? '') || compararTexto(a.id, b.id);
}

/**
 * El diagnóstico vigente entre los candidatos (ya filtrados por activo y por RN-07 por quien llama); `undefined` si no
 * hay ninguno. Lo usan la ficha y el checklist: la ficha, el listado y el análisis no pueden discrepar.
 */
export function elegirDiagnosticoVigente<T>(
  candidatos: readonly T[],
  datosDe: (candidato: T) => DatosDeVigencia,
): T | undefined {
  return [...candidatos].sort((a, b) => compararVigencia(datosDe(a), datosDe(b)))[0];
}

/**
 * La misma regla como `ORDER BY` de SQL (listado y caso del análisis), para que la consulta y `compararVigencia`
 * no diverjan. `prefijo` es el alias de la tabla con su punto (`'d.'`); es un literal del código, nunca entrada.
 */
export function sqlOrdenDeDiagnosticoVigente(prefijo = ''): string {
  return `${prefijo}diagnosed_at DESC, ${prefijo}id ASC`;
}
