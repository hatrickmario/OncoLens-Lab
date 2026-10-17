export type EstadoDeCuenta = 'pendiente' | 'activo' | 'desactivado' | 'rechazado';

export interface UsuarioParaLogin {
  id: string;
  passwordHash: string;
  accountStatus: EstadoDeCuenta;
  rol: string;
}

export interface NuevaSesion {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface SesionConUsuario {
  userId: string;
  rol: string;
  accountStatus: EstadoDeCuenta;
  expiresAt: Date;
  revoked: boolean;
}

export interface AuthRepository {
  buscarUsuarioPorCorreo(correo: string): Promise<UsuarioParaLogin | null>;
  crearSesion(sesion: NuevaSesion): Promise<void>;
  buscarSesionPorTokenHash(tokenHash: string): Promise<SesionConUsuario | null>;
}

/** Consulta SQL mínima que necesita el repository (la cumplen `pg.Pool` y `pg.Client`). */
export interface Consultador {
  query(sql: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export function createAuthRepository(_db: Consultador): AuthRepository {
  const noImplementado = (): never => {
    throw new Error('no implementado');
  };
  return {
    buscarUsuarioPorCorreo: noImplementado,
    crearSesion: noImplementado,
    buscarSesionPorTokenHash: noImplementado,
  };
}
