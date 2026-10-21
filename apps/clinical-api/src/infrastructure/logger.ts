/** Línea de log estructurada: nunca lleva identidad, PHI, secretos, contraseñas ni tokens (RN-10, NFR-11). */
export type LineaDeLog = Record<string, unknown>;

export type Registrar = (linea: LineaDeLog) => void;

/**
 * Lista CERRADA en código de campos que ningún log puede llevar, a cualquier profundidad y sin distinguir mayúsculas
 * (design D5): cuerpos de request, identidad, contacto, IP del cliente y credenciales. La configuración solo puede
 * AÑADIR campos (`LOG_REDACT_EXTRA_FIELDS`); no existe forma de quitar uno de esta base.
 */
export const CAMPOS_SENSIBLES_BASE: readonly string[] = Object.freeze([
  'body',
  'question',
  'identification',
  'name',
  'fullName',
  'nationalId',
  'documentNumber',
  'originalFilename',
  'email',
  'ip',
  'remoteAddress',
  'x-forwarded-for',
  'cookie',
  'set-cookie',
  'authorization',
  'password',
  'birthDate',
  'phone',
  'address',
  'legalRepresentative',
]);
const MARCA_DE_REDACCION = '[REDACTADO]';

/** Unión de la base cerrada y los campos extra de configuración, en minúsculas: nunca menor que la base. */
function camposSensiblesEfectivos(extra: readonly string[]): ReadonlySet<string> {
  return new Set([...CAMPOS_SENSIBLES_BASE, ...extra].map((campo) => campo.toLowerCase()));
}

/** Copia el valor sustituyendo, a cualquier profundidad, los campos sensibles (sin distinguir mayúsculas). */
export function descartarCamposSensibles(valor: unknown, campos: ReadonlySet<string>): unknown {
  if (Array.isArray(valor))
    return valor.map((elemento) => descartarCamposSensibles(elemento, campos));
  if (valor === null || typeof valor !== 'object') return valor;
  return Object.fromEntries(
    Object.entries(valor).map(([campo, contenido]) => [
      campo,
      campos.has(campo.toLowerCase())
        ? MARCA_DE_REDACCION
        : descartarCamposSensibles(contenido, campos),
    ]),
  );
}

/** Registrador que descarta los campos sensibles y escribe una línea JSON por evento. */
export function crearRegistrador(
  escribir: (linea: string) => void,
  opciones: { camposSensiblesExtra?: readonly string[] } = {},
): Registrar {
  const campos = camposSensiblesEfectivos(opciones.camposSensiblesExtra ?? []);
  return (linea) => {
    escribir(JSON.stringify(descartarCamposSensibles(linea, campos)));
  };
}

/** Registrador a consola con solo la base cerrada (herramientas como el seed); el servicio usa el de `server.ts`. */
export const registrarEnConsola: Registrar = crearRegistrador((linea) => {
  console.info(linea);
});
