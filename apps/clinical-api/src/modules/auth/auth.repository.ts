export type RolDeUsuario = 'doctor' | 'admin';
export type EstadoDeCuenta = 'pendiente' | 'activo' | 'desactivado' | 'rechazado';

export interface UsuarioParaLogin {
  id: string;
  passwordHash: string;
  accountStatus: EstadoDeCuenta;
  rol: RolDeUsuario;
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
  rol: RolDeUsuario;
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

/**
 * `ip_address` y `user_agent` son NOT NULL en `auth.session`: en el S1 se guardan vacíos (D4); el bloqueo por IP de
 * US-044 definirá cómo `web` propaga la IP del cliente.
 */
export function createAuthRepository(db: Consultador): AuthRepository {
  return {
    async buscarUsuarioPorCorreo(correo) {
      const { rows } = await db.query(
        `SELECT u.id, u.password_hash, u.account_status, r.name AS rol
           FROM auth."user" u JOIN auth.role r ON r.id = u.role_id
          WHERE u.email = $1`,
        [correo],
      );
      const fila = rows[0];
      if (fila === undefined) return null;
      return {
        id: fila['id'] as string,
        passwordHash: fila['password_hash'] as string,
        accountStatus: fila['account_status'] as EstadoDeCuenta,
        rol: fila['rol'] as RolDeUsuario,
      };
    },

    async crearSesion(sesion) {
      await db.query(
        `INSERT INTO auth.session
           (id, user_id, token_hash, expires_at, last_seen_at, ip_address, user_agent, revoked, created_at)
         VALUES ($1, $2, $3, $4, $5, '', '', false, $6)`,
        [
          sesion.id,
          sesion.userId,
          sesion.tokenHash,
          sesion.expiresAt,
          sesion.lastSeenAt,
          sesion.createdAt,
        ],
      );
    },

    async buscarSesionPorTokenHash(tokenHash) {
      const { rows } = await db.query(
        `SELECT s.user_id, s.expires_at, s.revoked, u.account_status, r.name AS rol
           FROM auth.session s
           JOIN auth."user" u ON u.id = s.user_id
           JOIN auth.role r ON r.id = u.role_id
          WHERE s.token_hash = $1`,
        [tokenHash],
      );
      const fila = rows[0];
      if (fila === undefined) return null;
      return {
        userId: fila['user_id'] as string,
        rol: fila['rol'] as RolDeUsuario,
        accountStatus: fila['account_status'] as EstadoDeCuenta,
        expiresAt: fila['expires_at'] as Date,
        revoked: fila['revoked'] as boolean,
      };
    },
  };
}
