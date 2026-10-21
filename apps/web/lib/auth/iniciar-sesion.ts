/**
 * `204` = sesión iniciada; `401` y `422` = credenciales (mismo aviso genérico, no revela cuál falló);
 * cualquier otra cosa (red, 429, 5xx) = aviso de servicio, para no culpar a la contraseña.
 */
export async function iniciarSesion(
  credenciales: unknown,
): Promise<'iniciada' | 'errorCredenciales' | 'errorServicio'> {
  try {
    const respuesta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credenciales),
    });
    if (respuesta.status === 204) return 'iniciada';
    return respuesta.status === 401 || respuesta.status === 422
      ? 'errorCredenciales'
      : 'errorServicio';
  } catch {
    return 'errorServicio';
  }
}
