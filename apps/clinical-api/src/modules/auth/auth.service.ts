import type { AuthConfig } from '../../config.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { AuthRepository } from './auth.repository.js';
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

export function createAuthService(_dependencias: DependenciasDeAuthService): AuthService {
  return {
    iniciarSesion: () => {
      throw new Error('no implementado');
    },
    resolverSesion: () => {
      throw new Error('no implementado');
    },
  };
}
