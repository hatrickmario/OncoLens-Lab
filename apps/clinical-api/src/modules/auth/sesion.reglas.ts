/**
 * Reglas puras de sesión y bloqueo (US-044): sin E/S y con el instante recibido, para que los tests las ejerciten con
 * un reloj fijo.
 */

/** El bloqueo vence en `lockedUntil` de forma excluyente: en ese instante exacto la cuenta ya puede iniciar sesión. */
export function cuentaBloqueada(usuario: { lockedUntil: Date | null }, ahora: Date): boolean {
  return usuario.lockedUntil !== null && usuario.lockedUntil.getTime() > ahora.getTime();
}

const MILISEGUNDOS_POR_MINUTO = 60_000;
const MILISEGUNDOS_POR_SEGUNDO = 1_000;

export interface InstantesDeSesion {
  expiresAt: Date;
  lastSeenAt: Date;
}

/**
 * Una sesión sirve mientras no llegó a su `expires_at` y no pasaron `SESSION_IDLE_MINUTES` desde su última actividad.
 * Ambos límites son excluyentes: en el instante exacto la sesión ya expiró.
 */
export function sesionVigente(
  sesion: InstantesDeSesion,
  ahora: Date,
  configuracion: { idleMinutes: number },
): boolean {
  const inactivaMs = ahora.getTime() - sesion.lastSeenAt.getTime();
  return (
    sesion.expiresAt.getTime() > ahora.getTime() &&
    inactivaMs < configuracion.idleMinutes * MILISEGUNDOS_POR_MINUTO
  );
}

/** Se escribe `last_seen_at` como mucho una vez cada `SESSION_TOUCH_SECONDS`, para no escribir en cada request. */
export function debeTocarseLaSesion(
  sesion: Pick<InstantesDeSesion, 'lastSeenAt'>,
  ahora: Date,
  configuracion: { touchSeconds: number },
): boolean {
  return (
    ahora.getTime() - sesion.lastSeenAt.getTime() >=
    configuracion.touchSeconds * MILISEGUNDOS_POR_SEGUNDO
  );
}
