import { parseArgs } from 'node:util';
import { ZodError } from 'zod';
import type { Registrar } from '../infrastructure/logger.js';
import { CorreoYaRegistradoError } from '../modules/users/users.repository.js';
import {
  altaDeUsuarioSchema,
  bajaDeUsuarioSchema,
  cambioDeRolSchema,
} from '../modules/users/users.schema.js';
import {
  RolInexistenteError,
  UsuarioInexistenteError,
  type UsersService,
} from '../modules/users/users.service.js';

/** Códigos de salida: 0 éxito, 1 fallo de la operación, 2 uso incorrecto de la CLI. */
export const SALIDA_OK = 0;
export const SALIDA_FALLO = 1;
export const SALIDA_USO = 2;

export interface EntornoDeCli {
  /** La contraseña solo entra por aquí (stdin): nunca por argumentos (quedarían en `ps` y en el historial). */
  leerContrasena(): Promise<string>;
  stdout(texto: string): void;
  stderr(texto: string): void;
}

export interface DependenciasDeCli {
  users: UsersService;
  registrar: Registrar;
}

const USO =
  'uso: oncolens users <create|set-role> --email <correo> --role <rol> | oncolens users deactivate --email <correo>';
const OPCION_DE_CAMPO: Readonly<Record<string, string>> = {
  email: '--email',
  rol: '--role',
  password: 'stdin',
};

class UsoIncorrectoError extends Error {}

/** Mensaje de uso sin eco de valores: solo nombra la opción que falla. */
function mensajeDeValidacion(error: ZodError): string {
  const opciones = error.issues.map((incidencia) => OPCION_DE_CAMPO[String(incidencia.path[0])]);
  return `valor inválido en ${[...new Set(opciones)].join(', ')}`;
}

function leerOpciones(
  argumentos: string[],
  permitidas: ('email' | 'role')[] = ['email', 'role'],
): { email: string; role: string } {
  const { values } = parseArgs({
    args: argumentos,
    options: Object.fromEntries(permitidas.map((nombre) => [nombre, { type: 'string' as const }])),
    strict: true,
  });
  return { email: values['email'] ?? '', role: values['role'] ?? '' };
}

async function crearUsuario(
  argumentos: string[],
  entorno: EntornoDeCli,
  users: UsersService,
): Promise<string> {
  const { email, role } = leerOpciones(argumentos);
  const password = await entorno.leerContrasena();
  const datos = altaDeUsuarioSchema.parse({ email, rol: role, password });
  const usuario = await users.crear(datos);
  return `id=${usuario.id} email=${usuario.email} rol=${usuario.rol}`;
}

async function cambiarRol(argumentos: string[], users: UsersService): Promise<string> {
  const { email, role } = leerOpciones(argumentos);
  const datos = cambioDeRolSchema.parse({ email, rol: role });
  const usuario = await users.cambiarRol(datos);
  return `id=${usuario.id} email=${usuario.email} rol=${usuario.rol}`;
}

async function desactivarUsuario(argumentos: string[], users: UsersService): Promise<string> {
  const { email } = leerOpciones(argumentos, ['email']);
  const datos = bajaDeUsuarioSchema.parse({ email });
  const usuario = await users.desactivar(datos);
  return `id=${usuario.id} email=${usuario.email} rol=${usuario.rol}`;
}

/** Despacha `users <acción>`; devuelve la línea de resultado (solo id, correo y rol). */
function despachar(
  argv: string[],
  entorno: EntornoDeCli,
  users: UsersService,
): { accion: string; resultado: Promise<string> } {
  const [grupo, accion, ...resto] = argv;
  if (grupo !== 'users') throw new UsoIncorrectoError(USO);
  if (accion === 'create') return { accion, resultado: crearUsuario(resto, entorno, users) };
  if (accion === 'set-role') return { accion, resultado: cambiarRol(resto, users) };
  if (accion === 'deactivate') return { accion, resultado: desactivarUsuario(resto, users) };
  throw new UsoIncorrectoError(USO);
}

/** Traduce el error a (código de salida, mensaje) sin valores sensibles; `undefined` si no es uno conocido. */
function fallo(error: unknown): { codigo: number; mensaje: string } | undefined {
  if (error instanceof UsoIncorrectoError) return { codigo: SALIDA_USO, mensaje: error.message };
  if (error instanceof ZodError) {
    return { codigo: SALIDA_USO, mensaje: mensajeDeValidacion(error) };
  }
  if (error instanceof RolInexistenteError) {
    return { codigo: SALIDA_FALLO, mensaje: '--role: el rol no existe' };
  }
  if (error instanceof UsuarioInexistenteError) {
    return { codigo: SALIDA_FALLO, mensaje: '--email: no existe un usuario con ese correo' };
  }
  if (error instanceof CorreoYaRegistradoError) {
    return { codigo: SALIDA_FALLO, mensaje: '--email: ya existe un usuario con ese correo' };
  }
  if ((error as { code?: unknown }).code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
    return { codigo: SALIDA_USO, mensaje: USO };
  }
  return undefined;
}

export async function ejecutarCli(
  argv: string[],
  entorno: EntornoDeCli,
  dependencias: DependenciasDeCli,
): Promise<number> {
  const { users, registrar } = dependencias;
  let accion = 'desconocida';
  try {
    const ejecucion = despachar(argv, entorno, users);
    accion = ejecucion.accion;
    entorno.stdout(`${await ejecucion.resultado}\n`);
    registrar({ event: 'cli.users', accion, resultado: 'ok' });
    return SALIDA_OK;
  } catch (error) {
    const conocido = fallo(error);
    registrar({ event: 'cli.users', accion, resultado: conocido ? 'rechazado' : 'error' });
    // Un error no previsto puede traer rutas o valores: solo se informa el hecho.
    entorno.stderr(`${conocido?.mensaje ?? 'error interno de la CLI'}\n`);
    return conocido?.codigo ?? SALIDA_FALLO;
  }
}
