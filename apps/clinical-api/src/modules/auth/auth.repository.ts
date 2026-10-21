export type RolDeUsuario = 'doctor' | 'admin';
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
  /** Nombre del rol tal como está en `auth.role` (los permisos mandan, no el nombre). */
  rol: string;
  /** Códigos de `auth.permission` del rol del usuario, resueltos en la misma consulta de la sesión. */
  permisos: readonly string[];
  accountStatus: EstadoDeCuenta;
  expiresAt: Date;
  revoked: boolean;
}

export interface AuthRepository {
  buscarUsuarioPorCorreo(correo: string): Promise<UsuarioParaLogin | null>;
  crearSesion(sesion: NuevaSesion): Promise<void>;
  buscarSesionPorTokenHash(tokenHash: string): Promise<SesionConUsuario | null>;
  /** Marca `revoked = true` en la sesión de ese token (idempotente). */
  revocarSesion(tokenHash: string): Promise<void>;
}

/** Consulta SQL mínima que necesita el repository (la cumplen `pg.Pool` y `pg.Client`). */
export interface Consultador {
  query(sql: string, valores?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Revoca todas las sesiones vivas del usuario. Recibe el consultador para participar en la transacción de quien la
 * llama. NO abre transacción: participa en la de quien la llama (la baja de una cuenta, US-045; el bloqueo por intentos, US-044): una sola implementación de la regla.
 */
export async function revocarSesiones(db: Consultador, userId: string): Promise<void> {
  await db.query('UPDATE auth.session SET revoked = true WHERE user_id = $1 AND NOT revoked', [
    userId,
  ]);
}

/**
 * `ip_address` y `user_agent` son nullable en `auth.session` y en el S1 se guardan NULL (D4, nunca la IP ni el UA reales); el bloqueo por IP de
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
        rol: fila['rol'] as string,
      };
    },

    async crearSesion(sesion) {
      await db.query(
        `INSERT INTO auth.session
           (id, user_id, token_hash, expires_at, last_seen_at, ip_address, user_agent, revoked, created_at)
         VALUES ($1, $2, $3, $4, $5, NULL, NULL, false, $6)`,
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
        `SELECT s.user_id, s.expires_at, s.revoked, u.account_status, r.name AS rol,
                COALESCE(array_agg(p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permisos
           FROM auth.session s
           JOIN auth."user" u ON u.id = s.user_id
           JOIN auth.role r ON r.id = u.role_id
           LEFT JOIN auth.role_permission rp ON rp.role_id = r.id
           LEFT JOIN auth.permission p ON p.id = rp.permission_id
          WHERE s.token_hash = $1
          GROUP BY s.user_id, s.expires_at, s.revoked, u.account_status, r.name`,
        [tokenHash],
      );
      const fila = rows[0];
      if (fila === undefined) return null;
      return {
        userId: fila['user_id'] as string,
        rol: fila['rol'] as string,
        permisos: fila['permisos'] as string[],
        accountStatus: fila['account_status'] as EstadoDeCuenta,
        expiresAt: fila['expires_at'] as Date,
        revoked: fila['revoked'] as boolean,
      };
    },

    async revocarSesion(tokenHash) {
      await db.query('UPDATE auth.session SET revoked = true WHERE token_hash = $1', [tokenHash]);
    },
  };
}
