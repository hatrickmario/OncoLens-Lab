import { createHash } from 'node:crypto';
import type { AuthConfig, SesionConfig } from '../../config/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type {
  AuthRepository,
  EstadoDeCuenta,
  ReservaDeIntentoDeCuenta,
  UsuarioParaLogin,
} from './auth.repository.js';
import { normalizarCorreo } from './correo.js';
import { cuentaBloqueada, debeTocarseLaSesion, sesionVigente } from './sesion.reglas.js';
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
  /**
   * `null` si el token no corresponde a una sesión vigente de un usuario activo. Con una sesión vigente ESCRIBE
   * `last_seen_at` (como mucho una vez cada `SESSION_TOUCH_SECONDS`); una sesión no vigente no se toca.
   */
  resolverYTocarSesion(token: string): Promise<SesionAutenticada | null>;
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

/** Un intento reservado en el registro por IP; si el login resulta correcto se libera, si falla se queda anotado. */
export interface ReservaDeIntentoPorIp {
  liberar(): void;
}

/**
 * Puerto del bloqueo por IP (US-044 D4): el adaptador decide dónde viven los intentos. La IP es la que Express atribuye
 * al cliente con `trust proxy`; el puerto nunca la registra en logs.
 */
export interface RegistroDeIntentosPorIp {
  /**
   * Comprueba el bloqueo y anota el intento en una sola operación SÍNCRONA, antes de verificar la contraseña: devuelve
   * `null` si la IP ya agotó sus intentos en la ventana vigente (contando los que están en curso).
   */
  reservar(ip: string): ReservaDeIntentoPorIp | null;
}

export interface DependenciasDeAuthService {
  repo: AuthRepository;
  hasher: PasswordHasher;
  tokens: GeneradorDeToken;
  ids: GeneradorDeIds;
  reloj: Clock;
  config: Pick<AuthConfig, 'sessionTtlHours'>;
  sesion: Pick<
    SesionConfig,
    'loginMaxFailedAttempts' | 'loginLockoutMinutes' | 'idleMinutes' | 'touchSeconds'
  >;
  registroDeIntentosPorIp: RegistroDeIntentosPorIp;
}

const MILISEGUNDOS_POR_HORA = 3_600_000;
/** Sin IP atribuible no hay límite por IP: la reserva existe pero no anota nada. */
const RESERVA_SIN_IP: ReservaDeIntentoPorIp = { liberar: () => undefined };
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
  const sesionConfig = dependencias.sesion;
  // Hash señuelo con los mismos parámetros: verificar contra él iguala el tiempo cuando el correo no existe (D3).
  const hashSenuelo = hasher.hash(CONTRASENA_DEL_SENUELO);
  hashSenuelo.catch(() => undefined);

  /**
   * Un solo camino y un solo error para correo inexistente, contraseña errónea, cuenta no activa y bloqueos por cuenta
   * o por IP (D3, US-044 D5). Los intentos se RESERVAN antes de verificar la contraseña (el estado que decide es el
   * que devuelven las reservas atómicas, no una lectura previa): ninguna ráfaga evalúa más de `LOGIN_MAX_FAILED_ATTEMPTS`
   * conjeturas. Bajo bloqueo se verifica contra el *hash* señuelo: mismo coste, mismo 401, y la contraseña correcta no
   * se evalúa de forma observable.
   */
  async function verificarCredencialesYContarFallos(
    email: string,
    password: string,
    ahora: Date,
    ip: string | undefined,
  ): Promise<UsuarioParaLogin> {
    const usuario = await repo.buscarUsuarioPorCorreo(normalizarCorreo(email));
    const reservaDeIp = ip === undefined ? RESERVA_SIN_IP : registroDeIntentosPorIp.reservar(ip);
    const reservaDeCuenta =
      reservaDeIp === null ? null : await reservarIntentoDeCuenta(usuario, ahora);
    const motivoDeBloqueo = motivoDeBloqueoDe(reservaDeIp, reservaDeCuenta);
    const hashAVerificar =
      motivoDeBloqueo !== null || usuario === null ? await hashSenuelo : usuario.passwordHash;
    const contrasenaCorrecta = await hasher.verify(hashAVerificar, password);
    if (reservaDeIp === null) throw new CredencialesInvalidasError('bloqueo_ip');
    if (motivoDeBloqueo !== null) {
      // Un intento rechazado por bloqueo de la cuenta no cuenta contra la IP.
      reservaDeIp.liberar();
      throw new CredencialesInvalidasError(motivoDeBloqueo);
    }
    if (usuario === null || reservaDeCuenta === null || !contrasenaCorrecta) {
      throw new CredencialesInvalidasError();
    }
    reservaDeIp.liberar();
    await repo.reiniciarFallos(usuario.id, reservaDeCuenta.intentos);
    return usuario;
  }

  /** `null` si no hay cuenta que proteger: correo inexistente o cuenta no activa (no hay contador que mover). */
  async function reservarIntentoDeCuenta(
    usuario: UsuarioParaLogin | null,
    ahora: Date,
  ): Promise<ReservaDeIntentoDeCuenta | null> {
    if (usuario === null || !cuentaHabilitada(usuario.accountStatus)) return null;
    // Atajo: con el bloqueo ya visible no hace falta escribir; la reserva atómica cubre el resto.
    if (cuentaBloqueada(usuario, ahora)) return { permitido: false, intentos: 0 };
    return repo.reservarIntentoDeLogin(usuario.id, ahora, {
      maxIntentos: sesionConfig.loginMaxFailedAttempts,
      minutosDeBloqueo: sesionConfig.loginLockoutMinutes,
    });
  }

  /** La IP manda sobre la cuenta. */
  function motivoDeBloqueoDe(
    reservaDeIp: ReservaDeIntentoPorIp | null,
    reservaDeCuenta: ReservaDeIntentoDeCuenta | null,
  ): MotivoDeRechazo | null {
    if (reservaDeIp === null) return 'bloqueo_ip';
    if (reservaDeCuenta !== null && !reservaDeCuenta.permitido) return 'bloqueo_cuenta';
    return null;
  }

  return {
    async iniciarSesion({ email, password }, ip) {
      const ahora = reloj.now();
      const usuario = await verificarCredencialesYContarFallos(email, password, ahora, ip);
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
    async resolverYTocarSesion(token) {
      const sesion = await repo.buscarSesionPorTokenHash(hashDeToken(token));
      if (sesion === null || sesion.revoked || !cuentaHabilitada(sesion.accountStatus)) return null;
      const ahora = reloj.now();
      if (!sesionVigente(sesion, ahora, sesionConfig)) return null;
      if (debeTocarseLaSesion(sesion, ahora, sesionConfig))
        await repo.tocarSesion(sesion.id, ahora);
      return { userId: sesion.userId, rol: sesion.rol, permisos: new Set(sesion.permisos) };
    },
    async cerrarSesion(token) {
      await repo.revocarSesion(hashDeToken(token));
    },
  };
}
