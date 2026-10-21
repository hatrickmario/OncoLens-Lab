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
  iniciarSesion(credenciales: { email: string; password: string }): Promise<{ token: string }>;
  /** `null` si el token no corresponde a una sesión vigente de un usuario activo. */
  resolverSesion(token: string): Promise<SesionAutenticada | null>;
  /** Revoca la sesión del token presentado (cierre de sesión, US-044 AC-1). */
  cerrarSesion(token: string): Promise<void>;
}

/**
 * Por qué se rechazó el login. Solo el log lo distingue (US-044 D5): la respuesta HTTP es siempre la misma.
 * Valores cerrados: nunca llevan correo, IP ni contraseña.
 */
export type MotivoDeRechazo = 'credenciales' | 'bloqueo_cuenta';

export class CredencialesInvalidasError extends Error {
  constructor(readonly motivo: MotivoDeRechazo = 'credenciales') {
    super('Credenciales inválidas');
    this.name = 'CredencialesInvalidasError';
  }
}

export interface DependenciasDeAuthService {
  repo: AuthRepository;
  hasher: PasswordHasher;
  tokens: GeneradorDeToken;
  ids: GeneradorDeIds;
  reloj: Clock;
  config: Pick<AuthConfig, 'sessionTtlHours'>;
  sesion: Pick<SesionConfig, 'loginMaxFailedAttempts' | 'loginLockoutMinutes'>;
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
  const { repo, hasher, tokens, ids, reloj, config, sesion } = dependencias;
  // Hash señuelo con los mismos parámetros: verificar contra él iguala el tiempo cuando el correo no existe (D3).
  const hashSenuelo = hasher.hash(CONTRASENA_DEL_SENUELO);
  hashSenuelo.catch(() => undefined);

  /**
   * Un solo camino y un solo error para correo inexistente, contraseña errónea, cuenta no activa y cuenta bloqueada
   * (D3, US-044 D5). Con la cuenta bloqueada se verifica contra el *hash* señuelo: mismo coste, mismo 401, y la
   * contraseña correcta no se evalúa de forma observable.
   */
  async function autenticarCredenciales(
    email: string,
    password: string,
    ahora: Date,
  ): Promise<UsuarioParaLogin> {
    const usuario = await repo.buscarUsuarioPorCorreo(normalizarCorreo(email));
    const bloqueada = usuario !== null && cuentaBloqueada(usuario, ahora);
    const hashAVerificar = bloqueada || usuario === null ? await hashSenuelo : usuario.passwordHash;
    const contrasenaCorrecta = await hasher.verify(hashAVerificar, password);
    if (bloqueada) throw new CredencialesInvalidasError('bloqueo_cuenta');
    if (usuario === null) throw new CredencialesInvalidasError();
    if (!contrasenaCorrecta) {
      await registrarFallo(usuario, ahora);
      throw new CredencialesInvalidasError();
    }
    if (!cuentaHabilitada(usuario.accountStatus)) throw new CredencialesInvalidasError();
    await repo.reiniciarFallos(usuario.id);
    return usuario;
  }

  /** Cuenta un fallo de contraseña y bloquea la cuenta al llegar a `LOGIN_MAX_FAILED_ATTEMPTS`. */
  function registrarFallo(usuario: UsuarioParaLogin, ahora: Date): Promise<void> {
    return repo.registrarFalloDeLogin(usuario.id, ahora, {
      maxIntentos: sesion.loginMaxFailedAttempts,
      minutosDeBloqueo: sesion.loginLockoutMinutes,
    });
  }

  return {
    async iniciarSesion({ email, password }) {
      const ahora = reloj.now();
      const usuario = await autenticarCredenciales(email, password, ahora);
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
