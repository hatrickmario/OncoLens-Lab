const FORMA_REGISTRABLE = /^[a-z0-9_-]{1,64}$/;

/** Nombre de un ítem, tipo o archivo para un mensaje: solo si tiene forma de clave del catálogo, nunca contenido arbitrario. */
export const nombrable = (valor) =>
  typeof valor === 'string' && FORMA_REGISTRABLE.test(valor) ? valor : '?';
