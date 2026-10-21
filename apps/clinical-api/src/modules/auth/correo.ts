/** Regla única de normalización del correo (login, alta por CLI y búsquedas): sin espacios y en minúsculas. */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}
