/** Anclas de la ficha a las que otras pantallas pueden enlazar (l1d-97, D4). Lista cerrada: no se amplía por el fragmento. */
export const ANCLAS_DE_FICHA = ['diagnostico', 'biomarcadores'] as const;

export type AnclaDeFicha = (typeof ANCLAS_DE_FICHA)[number];

/** Anclas de la vista de caso a las que otras pantallas pueden enlazar (l1d-96, D9). Lista cerrada. */
export const ANCLAS_DE_CASO = ['datos-criticos'] as const;

export type AnclaDeCaso = (typeof ANCLAS_DE_CASO)[number];

/**
 * Devuelve el ancla de `permitidas` que nombra el fragmento de la URL (con o sin `#`), o `null` si no es una de ellas.
 * El resultado, y no el fragmento, es lo único que se usa para buscar el elemento: nunca un selector armado en crudo.
 */
export function anclaPermitida(
  fragmento: string,
  permitidas: readonly string[] = ANCLAS_DE_FICHA,
): string | null {
  const nombre = fragmento.startsWith('#') ? fragmento.slice(1) : fragmento;
  return permitidas.find((ancla) => ancla === nombre) ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Única comprobación de UUID de las rutas de paciente. */
export function esUuid(valor: string): boolean {
  return UUID.test(valor);
}

/**
 * Ruta de la vista de caso, con ancla opcional. La usan el aviso de faltantes (`#datos-criticos`) y la ficha.
 * Precondición: `patientId` es un UUID; cualquier otro valor lanza en vez de armar una ruta con él.
 */
export function hrefDeVistaDeCaso(patientId: string, ancla?: AnclaDeCaso): string {
  if (!esUuid(patientId)) throw new Error('patientId debe ser un UUID');
  return ancla ? `/pacientes/${patientId}/caso#${ancla}` : `/pacientes/${patientId}/caso`;
}

/** Ruta de la ficha del paciente, con ancla opcional (D7). Misma precondición de UUID. */
export function hrefDeFicha(patientId: string, ancla?: AnclaDeFicha): string {
  if (!esUuid(patientId)) throw new Error('patientId debe ser un UUID');
  return ancla ? `/pacientes/${patientId}#${ancla}` : `/pacientes/${patientId}`;
}
