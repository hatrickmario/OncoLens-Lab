import type { Consultador } from '../auth/auth.repository.js';

export interface UsuarioRegistrado {
  id: string;
  email: string;
  rol: string;
}

export interface NuevoUsuario {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  roleId: string;
  now: Date;
}

export class CorreoYaRegistradoError extends Error {
  constructor() {
    super('Ya existe un usuario con ese correo');
    this.name = 'CorreoYaRegistradoError';
  }
}

export interface UsersRepository {
  buscarRolPorNombre(nombre: string): Promise<{ id: string } | null>;
  buscarUsuarioPorCorreo(correo: string): Promise<UsuarioRegistrado | null>;
  /** Lanza `CorreoYaRegistradoError` si el correo ya existe. */
  crearUsuario(usuario: NuevoUsuario): Promise<void>;
  cambiarRol(userId: string, roleId: string, now: Date): Promise<void>;
}

const VIOLACION_DE_UNICIDAD = '23505';

/**
 * Repository de usuarios. `db` es UNA conexión (no un pool): así `BEGIN`/`COMMIT` de las operaciones compuestas caen
 * en la misma sesión de PostgreSQL.
 */
export function createUsersRepository(db: Consultador): UsersRepository {
  return {
    async buscarRolPorNombre(nombre) {
      const { rows } = await db.query('SELECT id FROM auth.role WHERE name = $1', [nombre]);
      const fila = rows[0];
      return fila === undefined ? null : { id: fila['id'] as string };
    },

    async buscarUsuarioPorCorreo(correo) {
      const { rows } = await db.query(
        `SELECT u.id, u.email, r.name AS rol
           FROM auth."user" u JOIN auth.role r ON r.id = u.role_id
          WHERE u.email = $1`,
        [correo],
      );
      const fila = rows[0];
      if (fila === undefined) return null;
      return {
        id: fila['id'] as string,
        email: fila['email'] as string,
        rol: fila['rol'] as string,
      };
    },

    async crearUsuario(usuario) {
      try {
        await db.query(
          `INSERT INTO auth."user"
             (id, email, password_hash, full_name, role_id, account_status, failed_login_count, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'activo', 0, $6, $6)`,
          [
            usuario.id,
            usuario.email,
            usuario.passwordHash,
            usuario.fullName,
            usuario.roleId,
            usuario.now,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === VIOLACION_DE_UNICIDAD) {
          throw new CorreoYaRegistradoError();
        }
        throw error;
      }
    },

    async cambiarRol(userId, roleId, now) {
      await db.query('UPDATE auth."user" SET role_id = $2, updated_at = $3 WHERE id = $1', [
        userId,
        roleId,
        now,
      ]);
    },
  };
}
