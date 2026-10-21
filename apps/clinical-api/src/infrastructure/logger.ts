/** Línea de log estructurada: nunca lleva identidad, PHI, secretos, contraseñas ni tokens (RN-10, NFR-11). */
export type LineaDeLog = Record<string, unknown>;

export type Registrar = (linea: LineaDeLog) => void;

export const CAMPOS_SENSIBLES_BASE: readonly string[] = [
  'password',
  'cookie',
  'set-cookie',
  'authorization',
];
const CAMPOS_SENSIBLES: ReadonlySet<string> = new Set(CAMPOS_SENSIBLES_BASE);
const MARCA_DE_REDACCION = '[REDACTADO]';

/** Copia el valor sustituyendo, a cualquier profundidad, los campos sensibles (sin distinguir mayúsculas). */
function redactar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(redactar);
  if (valor === null || typeof valor !== 'object') return valor;
  return Object.fromEntries(
    Object.entries(valor).map(([campo, contenido]) => [
      campo,
      CAMPOS_SENSIBLES.has(campo.toLowerCase()) ? MARCA_DE_REDACCION : redactar(contenido),
    ]),
  );
}

/** Registrador que redacta los campos sensibles y escribe una línea JSON por evento. */
export function crearRegistrador(
  escribir: (linea: string) => void,
  _opciones: { camposSensiblesExtra?: readonly string[] } = {},
): Registrar {
  return (linea) => {
    escribir(JSON.stringify(redactar(linea)));
  };
}

export const registrarEnConsola: Registrar = crearRegistrador((linea) => {
  console.info(linea);
});
