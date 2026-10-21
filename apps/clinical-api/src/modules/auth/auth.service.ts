import { createHash } from 'node:crypto';
import type { AuthConfig, SesionConfig } from '../../config/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { AuthRepository, EstadoDeCuenta, UsuarioParaLogin } from './auth.repository.js';
import { normalizarCorreo } from './correo.js';
import { cuentaBloqueada } from './sesion.reglas.js';
import type { PasswordHasher } from './password-hasher.js';

export interface GeneradorDeToken {
  nuevo(): string;
}

export interface SesionAutenticada {
  userId: string;
  rol: string;
  /** Permisos del rol en el momento de la request: la autorización (`authorize`) mira estos, no el nombre del rol. */
  permisos: ReadonlySet<string>;
}

export interface AuthService {
  /** Crea una sesión nueva y devuelve el token opaco en claro (solo viaja en la cookie). */
  iniciarSesion(
    credenciales: { email: string; password: string },
    ip?: string,
  ): Promise<{ token: string }>;
  /** `null` si el token no corresponde a una sesión vigente de un usuario activo. */
  resolverSesion(token: string): Promise<SesionAutenticada | null>;
  /** Revoca la sesión del token presentado (cierre de sesión, US-044 AC-1). */
  cerrarSesion(token: string): Promise<void>;
}

/**
 * Por qué se rechazó el login. Solo el log lo distingue (US-044 D5): la respuesta HTTP es siempre la misma.
 * Valores cerrados: nunca llevan correo, IP ni contraseña.
 */
export type MotivoDeRechazo = 'credenciales' | 'bloqueo_cuenta' | 'bloqueo_ip';

export class CredencialesInvalidasError extends Error {
  constructor(readonly motivo: MotivoDeRechazo = 'credenciales') {
    super('Credenciales inválidas');
    this.name = 'CredencialesInvalidasError';
  }
}

/**
 * Puerto del bloqueo por IP (US-044 D4): el adaptador decide dónde viven los fallos. La IP es la que Express atribuye
 * al cliente con `trust proxy`; el puerto nunca la registra en logs.
 */
export interface RegistroDeIntentosPorIp {
  /** `true` si la IP acumuló el máximo de fallos dentro de la ventana vigente. */
  estaBloqueada(ip: string): boolean;
  registrarFallo(ip: string): void;
}

export interface DependenciasDeAuthService {
  repo: AuthRepository;
  hasher: PasswordHasher;
  tokens: GeneradorDeToken;
  ids: GeneradorDeIds;
  reloj: Clock;
  config: Pick<AuthConfig, 'sessionTtlHours'>;
  sesion: Pick<SesionConfig, 'loginMaxFailedAttempts' | 'loginLockoutMinutes'>;
  registroDeIntentosPorIp: RegistroDeIntentosPorIp;
}

const MILISEGUNDOS_POR_HORA = 3_600_000;
const CONTRASENA_DEL_SENUELO = 'señuelo';

/** SHA-256 en hex del token opaco (D1): el token tiene entropía completa, basta un hash rápido y exacto. */
export function hashDeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Única regla de "puede iniciar o mantener sesión": solo `activo` (data-model, tabla de cuentas). */
function cuentaHabilitada(estado: EstadoDeCuenta): boolean {
  return estado === 'activo';
}

export function createAuthService(dependencias: DependenciasDeAuthService): AuthService {
  const { repo, hasher, tokens, ids, reloj, config, registroDeIntentosPorIp } = dependencias;
  const bloqueo = dependencias.sesion;
  // Hash señuelo con los mismos parámetros: verificar contra él iguala el tiempo cuando el correo no existe (D3).
  const hashSenuelo = hasher.hash(CONTRASENA_DEL_SENUELO);
  hashSenuelo.catch(() => undefined);

  /**
   * Un solo camino y un solo error para correo inexistente, contraseña errónea, cuenta no activa y bloqueos por cuenta
   * o por IP (D3, US-044 D5). Bajo bloqueo se verifica contra el *hash* señuelo: mismo coste, mismo 401, y la
   * contraseña correcta no se evalúa de forma observable.
   */
  async function autenticarCredenciales(
    email: string,
    password: string,
    ahora: Date,
    ip: string | undefined,
  ): Promise<UsuarioParaLogin> {
    const usuario = await repo.buscarUsuarioPorCorreo(normalizarCorreo(email));
    const motivoDeBloqueo = motivoDeBloqueoDe(usuario, ahora, ip);
    const hashAVerificar =
      motivoDeBloqueo !== null || usuario === null ? await hashSenuelo : usuario.passwordHash;
    const contrasenaCorrecta = await hasher.verify(hashAVerificar, password);
    if (motivoDeBloqueo !== null) throw new CredencialesInvalidasError(motivoDeBloqueo);
    if (usuario === null) throw new CredencialesInvalidasError();
    if (!contrasenaCorrecta) {
      await registrarFallo(usuario, ahora);
      throw new CredencialesInvalidasError();
    }
    if (!cuentaHabilitada(usuario.accountStatus)) throw new CredencialesInvalidasError();
    await repo.reiniciarFallos(usuario.id);
    return usuario;
  }

  /** La IP manda sobre la cuenta; sin IP atribuible no hay bloqueo por IP. */
  function motivoDeBloqueoDe(
    usuario: UsuarioParaLogin | null,
    ahora: Date,
    ip: string | undefined,
  ): MotivoDeRechazo | null {
    if (ip !== undefined && registroDeIntentosPorIp.estaBloqueada(ip)) return 'bloqueo_ip';
    if (usuario !== null && cuentaBloqueada(usuario, ahora)) return 'bloqueo_cuenta';
    return null;
  }

  /** Cuenta un fallo de contraseña y bloquea la cuenta al llegar a `LOGIN_MAX_FAILED_ATTEMPTS`. */
  function registrarFallo(usuario: UsuarioParaLogin, ahora: Date): Promise<void> {
    return repo.registrarFalloDeLogin(usuario.id, ahora, {
      maxIntentos: bloqueo.loginMaxFailedAttempts,
      minutosDeBloqueo: bloqueo.loginLockoutMinutes,
    });
  }

  /** Todo rechazo por credenciales (no por bloqueo) cuenta contra la IP del cliente, exista o no el correo. */
  async function autenticarContandoFallosPorIp(
    email: string,
    password: string,
    ahora: Date,
    ip: string | undefined,
  ): Promise<UsuarioParaLogin> {
    try {
      return await autenticarCredenciales(email, password, ahora, ip);
    } catch (error) {
      if (error instanceof CredencialesInvalidasError && error.motivo === 'credenciales') {
        if (ip !== undefined) registroDeIntentosPorIp.registrarFallo(ip);
      }
      throw error;
    }
  }

  return {
    async iniciarSesion({ email, password }, ip) {
      const ahora = reloj.now();
      const usuario = await autenticarContandoFallosPorIp(email, password, ahora, ip);
      const token = tokens.nuevo();
      const creada = await repo.crearSesion({
        id: ids(),
        userId: usuario.id,
        tokenHash: hashDeToken(token),
        expiresAt: new Date(ahora.getTime() + config.sessionTtlHours * MILISEGUNDOS_POR_HORA),
        lastSeenAt: ahora,
        createdAt: ahora,
      });
      // La cuenta dejó de estar activa entre la verificación y la inserción (baja concurrente): mismo 401.
      if (!creada) throw new CredencialesInvalidasError();
      return { token };
    },
    async resolverSesion(token) {
      const sesion = await repo.buscarSesionPorTokenHash(hashDeToken(token));
      if (sesion === null || sesion.revoked || !cuentaHabilitada(sesion.accountStatus)) return null;
      // `expires_at` es absoluto y excluyente: en el instante exacto la sesión ya caducó (S1 resp. 14c).
      if (sesion.expiresAt.getTime() <= reloj.now().getTime()) return null;
      return { userId: sesion.userId, rol: sesion.rol, permisos: new Set(sesion.permisos) };
    },
    async cerrarSesion(token) {
      await repo.revocarSesion(hashDeToken(token));
    },
  };
}
