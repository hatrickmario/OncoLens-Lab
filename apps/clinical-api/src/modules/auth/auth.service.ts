import { createHash } from 'node:crypto';
import type { AuthConfig } from '../../config.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { AuthRepository, UsuarioParaLogin } from './auth.repository.js';
import type { PasswordHasher } from './password-hasher.js';

export interface GeneradorDeToken {
  nuevo(): string;
}
export type GeneradorDeIds = () => string;

export interface SesionAutenticada {
  userId: string;
  rol: string;
}

export interface AuthService {
  /** Crea una sesión nueva y devuelve el token opaco en claro (solo viaja en la cookie). */
  iniciarSesion(credenciales: { email: string; password: string }): Promise<{ token: string }>;
  /** `null` si el token no corresponde a una sesión vigente de un usuario activo. */
  resolverSesion(token: string): Promise<SesionAutenticada | null>;
}

export class CredencialesInvalidasError extends Error {
  constructor() {
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
}

const MILISEGUNDOS_POR_HORA = 3_600_000;
const CONTRASENA_DEL_SENUELO = 'señuelo';

/** SHA-256 en hex del token opaco (D1): el token tiene entropía completa, basta un hash rápido y exacto. */
export function hashDeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

export function createAuthService(dependencias: DependenciasDeAuthService): AuthService {
  const { repo, hasher, tokens, ids, reloj, config } = dependencias;
  // Hash señuelo con los mismos parámetros: verificar contra él iguala el tiempo cuando el correo no existe (D3).
  const hashSenuelo = hasher.hash(CONTRASENA_DEL_SENUELO);
  hashSenuelo.catch(() => undefined);

  /** Un solo camino y un solo error para correo inexistente, contraseña errónea y cuenta no activa (D3). */
  async function autenticarCredenciales(
    email: string,
    password: string,
  ): Promise<UsuarioParaLogin> {
    const usuario = await repo.buscarUsuarioPorCorreo(normalizarCorreo(email));
    const hashAVerificar = usuario?.passwordHash ?? (await hashSenuelo);
    const contrasenaCorrecta = await hasher.verify(hashAVerificar, password);
    if (usuario === null || !contrasenaCorrecta || usuario.accountStatus !== 'activo') {
      throw new CredencialesInvalidasError();
    }
    return usuario;
  }

  return {
    async iniciarSesion({ email, password }) {
      const usuario = await autenticarCredenciales(email, password);
      const token = tokens.nuevo();
      const ahora = reloj.now();
      await repo.crearSesion({
        id: ids(),
        userId: usuario.id,
        tokenHash: hashDeToken(token),
        expiresAt: new Date(ahora.getTime() + config.sessionTtlHours * MILISEGUNDOS_POR_HORA),
        lastSeenAt: ahora,
        createdAt: ahora,
      });
      return { token };
    },
    resolverSesion: () => {
      throw new Error('no implementado');
    },
  };
}
