import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import { normalizarCorreo } from '../auth/correo.js';
import type { PasswordHasher } from '../auth/password-hasher.js';
import type { UsersRepository, UsuarioRegistrado } from './users.repository.js';

export class RolInexistenteError extends Error {
  constructor() {
    super('El rol no existe');
    this.name = 'RolInexistenteError';
  }
}

export class UsuarioInexistenteError extends Error {
  constructor() {
    super('No existe un usuario con ese correo');
    this.name = 'UsuarioInexistenteError';
  }
}

export interface UsersService {
  /** Alta de una cuenta `activa`; la contraseña solo existe en memoria hasta hashearla (Argon2id). */
  crear(entrada: { email: string; rol: string; password: string }): Promise<UsuarioRegistrado>;
  cambiarRol(entrada: { email: string; rol: string }): Promise<UsuarioRegistrado>;
  /** Baja de la cuenta: `desactivado` y sesiones revocadas en la misma transacción (idempotente). */
  desactivar(entrada: { email: string }): Promise<UsuarioRegistrado>;
}

export interface DependenciasDeUsersService {
  repo: UsersRepository;
  hasher: PasswordHasher;
  reloj: Clock;
  ids: GeneradorDeIds;
}

export function createUsersService(dependencias: DependenciasDeUsersService): UsersService {
  const { repo, hasher, reloj, ids } = dependencias;

  async function exigirRol(nombre: string): Promise<{ id: string }> {
    const rol = await repo.buscarRolPorNombre(nombre);
    if (rol === null) throw new RolInexistenteError();
    return rol;
  }

  /** Busca por el correo normalizado (misma regla que el alta y el login) o lanza `UsuarioInexistenteError`. */
  async function buscarOFallar(correo: string): Promise<UsuarioRegistrado> {
    const usuario = await repo.buscarUsuarioRegistradoPorCorreo(normalizarCorreo(correo));
    if (usuario === null) throw new UsuarioInexistenteError();
    return usuario;
  }

  return {
    async crear({ email: correo, rol, password }) {
      const email = normalizarCorreo(correo);
      const { id: roleId } = await exigirRol(rol);
      const id = ids();
      await repo.crearUsuario({
        id,
        email,
        passwordHash: await hasher.hash(password),
        // `full_name` es NOT NULL y la CLI no recibe nombre: el correo es el valor provisional (design).
        fullName: email,
        roleId,
        now: reloj.now(),
      });
      return { id, email, rol };
    },

    async cambiarRol({ email, rol }) {
      const usuario = await buscarOFallar(email);
      const { id: roleId } = await exigirRol(rol);
      await repo.cambiarRol(usuario.id, roleId, reloj.now());
      return { ...usuario, rol };
    },

    async desactivar({ email }) {
      const usuario = await buscarOFallar(email);
      await repo.desactivarYRevocarSesiones(usuario.id, reloj.now());
      return usuario;
    },
  };
}
