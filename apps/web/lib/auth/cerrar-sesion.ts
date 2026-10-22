/**
 * `204` = sesión cerrada; `401` = la sesión ya no existía (expirada); cualquier otra cosa (red, 403, 5xx) = fallo,
 * y el médico sigue en la página para reintentar.
 */
export async function cerrarSesion(): Promise<'cerrada' | 'expirada' | 'fallo'> {
  try {
    const respuesta = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (respuesta.status === 204) return 'cerrada';
    return respuesta.status === 401 ? 'expirada' : 'fallo';
  } catch {
    return 'fallo';
  }
}
