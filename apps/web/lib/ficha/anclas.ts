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

/** Única comprobación de UUID de las rutas de paciente. */
export function esUuid(valor: string): boolean {
  return UUID.test(valor);
}

/**
 * Ruta de la ficha del paciente, con ancla opcional (D7). La usan el aviso de faltantes y la tabla de aplicabilidad;
 * otras pantallas arman `/pacientes/{id}/analisis` por su cuenta (deuda anotada en tasks.md).
 * Precondición: `patientId` es un UUID; cualquier otro valor lanza en vez de armar una ruta con él.
 */
export function hrefDeFicha(patientId: string, ancla?: AnclaDeFicha): string {
  if (!esUuid(patientId)) throw new Error('patientId debe ser un UUID');
  return ancla ? `/pacientes/${patientId}#${ancla}` : `/pacientes/${patientId}`;
}
