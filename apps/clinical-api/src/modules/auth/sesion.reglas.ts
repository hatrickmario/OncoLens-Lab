/**
 * Reglas puras de sesión y bloqueo (US-044): sin E/S y con el instante recibido, para que los tests las ejerciten con
 * un reloj fijo.
 */

/** El bloqueo vence en `lockedUntil` de forma excluyente: en ese instante exacto la cuenta ya puede iniciar sesión. */
export function cuentaBloqueada(usuario: { lockedUntil: Date | null }, ahora: Date): boolean {
  return usuario.lockedUntil !== null && usuario.lockedUntil.getTime() > ahora.getTime();
}
