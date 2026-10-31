/** Anclas de la ficha a las que otras pantallas pueden enlazar (l1d-97, D4). Lista cerrada: no se amplía por el fragmento. */
export const ANCLAS_DE_FICHA = ['diagnostico', 'biomarcadores'] as const;

export type AnclaDeFicha = (typeof ANCLAS_DE_FICHA)[number];

/**
 * Devuelve el ancla permitida que nombra el fragmento de la URL (con o sin `#`), o `null` si no es una de las dos.
 * El resultado, y no el fragmento, es lo único que se usa para buscar el elemento: nunca un selector armado en crudo.
 */
export function anclaPermitida(fragmento: string): AnclaDeFicha | null {
  const nombre = fragmento.startsWith('#') ? fragmento.slice(1) : fragmento;
  return ANCLAS_DE_FICHA.find((ancla) => ancla === nombre) ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ruta de la ficha del paciente, con ancla opcional: único lugar que arma esta ruta (D7).
 * Precondición: `patientId` es un UUID; cualquier otro valor lanza en vez de armar una ruta con él.
 */
export function hrefDeFicha(patientId: string, ancla?: AnclaDeFicha): string {
  if (!UUID.test(patientId)) throw new Error('patientId debe ser un UUID');
  return ancla ? `/pacientes/${patientId}#${ancla}` : `/pacientes/${patientId}`;
}
