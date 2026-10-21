export type RolDeUsuario = 'doctor' | 'admin';
export type EstadoDeCuenta = 'pendiente' | 'activo' | 'desactivado' | 'rechazado';

export interface UsuarioParaLogin {
  id: string;
  passwordHash: string;
  accountStatus: EstadoDeCuenta;
  rol: string;
  /** Fin del bloqueo por intentos fallidos; `null` si la cuenta no está bloqueada. */
  lockedUntil: Date | null;
}

export interface ParametrosDeBloqueo {
  maxIntentos: number;
  minutosDeBloqueo: number;
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
  id: string;
  userId: string;
  /** Nombre del rol tal como está en `auth.role` (los permisos mandan, no el nombre). */
  rol: string;
  /** Códigos de `auth.permission` del rol del usuario, resueltos en la misma consulta de la sesión. */
  permisos: readonly string[];
  accountStatus: EstadoDeCuenta;
  expiresAt: Date;
  lastSeenAt: Date;
  revoked: boolean;
}

export interface AuthRepository {
  buscarUsuarioPorCorreo(correo: string): Promise<UsuarioParaLogin | null>;
  /**
   * Crea la sesión solo si la cuenta sigue `activo` en ese instante (la baja o el rechazo concurrentes no dejan una
   * sesión viva, design L1D-199). Devuelve `false` si no se creó.
   */
  crearSesion(sesion: NuevaSesion): Promise<boolean>;
  /**
   * Cuenta un fallo de contraseña: si el bloqueo anterior ya venció, el conteo reinicia en 1; al llegar a
   * `maxIntentos` fija `locked_until = ahora + minutosDeBloqueo`.
   */
  registrarFalloDeLogin(
    userId: string,
    ahora: Date,
    parametros: ParametrosDeBloqueo,
  ): Promise<void>;
  /** Un login correcto pone el contador a 0 y quita el bloqueo (sin escribir si no había nada que limpiar). */
  reiniciarFallos(userId: string): Promise<void>;
  buscarSesionPorTokenHash(tokenHash: string): Promise<SesionConUsuario | null>;
  /** Registra la actividad de la sesión (`last_seen_at`); una sesión revocada entretanto no se toca. */
  tocarSesion(id: string, ahora: Date): Promise<void>;
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
        `SELECT u.id, u.password_hash, u.account_status, u.locked_until, r.name AS rol
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
        lockedUntil: fila['locked_until'] as Date | null,
      };
    },

    async crearSesion(sesion) {
      // FOR SHARE: si la baja tiene bloqueada la fila, espera y reevalúa el estado; si gana la sesión, la baja la revoca.
      const { rows } = await db.query(
        `INSERT INTO auth.session
           (id, user_id, token_hash, expires_at, last_seen_at, ip_address, user_agent, revoked, created_at)
         SELECT $1, $2, $3, $4, $5, NULL, NULL, false, $6
          WHERE EXISTS (SELECT 1 FROM auth."user" WHERE id = $2 AND account_status = 'activo' FOR SHARE)
         RETURNING id`,
        [
          sesion.id,
          sesion.userId,
          sesion.tokenHash,
          sesion.expiresAt,
          sesion.lastSeenAt,
          sesion.createdAt,
        ],
      );
      return rows.length > 0;
    },

    async registrarFalloDeLogin(userId, ahora, parametros) {
      await db.query(
        `WITH previo AS (
           SELECT CASE WHEN locked_until IS NOT NULL AND locked_until <= $2 THEN 0 ELSE failed_login_count END AS n
             FROM auth."user" WHERE id = $1 FOR UPDATE)
         UPDATE auth."user" u
            SET failed_login_count = previo.n + 1,
                locked_until = CASE WHEN previo.n + 1 >= $3 THEN $4::timestamptz ELSE NULL END
           FROM previo
          WHERE u.id = $1`,
        [
          userId,
          ahora,
          parametros.maxIntentos,
          new Date(ahora.getTime() + parametros.minutosDeBloqueo * 60_000),
        ],
      );
    },

    async reiniciarFallos(userId) {
      await db.query(
        `UPDATE auth."user" SET failed_login_count = 0, locked_until = NULL
          WHERE id = $1 AND (failed_login_count <> 0 OR locked_until IS NOT NULL)`,
        [userId],
      );
    },

    async buscarSesionPorTokenHash(tokenHash) {
      const { rows } = await db.query(
        `SELECT s.id, s.user_id, s.expires_at, s.last_seen_at, s.revoked, u.account_status, r.name AS rol,
                COALESCE(array_agg(p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permisos
           FROM auth.session s
           JOIN auth."user" u ON u.id = s.user_id
           JOIN auth.role r ON r.id = u.role_id
           LEFT JOIN auth.role_permission rp ON rp.role_id = r.id
           LEFT JOIN auth.permission p ON p.id = rp.permission_id
          WHERE s.token_hash = $1
          GROUP BY s.id, s.user_id, s.expires_at, s.last_seen_at, s.revoked, u.account_status, r.name`,
        [tokenHash],
      );
      const fila = rows[0];
      if (fila === undefined) return null;
      return {
        id: fila['id'] as string,
        userId: fila['user_id'] as string,
        rol: fila['rol'] as string,
        permisos: fila['permisos'] as string[],
        accountStatus: fila['account_status'] as EstadoDeCuenta,
        expiresAt: fila['expires_at'] as Date,
        lastSeenAt: fila['last_seen_at'] as Date,
        revoked: fila['revoked'] as boolean,
      };
    },

    async tocarSesion(id, ahora) {
      await db.query('UPDATE auth.session SET last_seen_at = $2 WHERE id = $1 AND NOT revoked', [
        id,
        ahora,
      ]);
    },

    async revocarSesion(tokenHash) {
      await db.query('UPDATE auth.session SET revoked = true WHERE token_hash = $1', [tokenHash]);
    },
  };
}
