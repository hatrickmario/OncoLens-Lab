import { describe, expect, it } from 'vitest';
import type { NuevoUsuario, UsersRepository } from '../../src/modules/users/users.repository.js';
import {
  createUsersService,
  RolInexistenteError,
  UsuarioInexistenteError,
} from '../../src/modules/users/users.service.js';
import { relojFijo } from '../support/usuarios.js';

/** Repository falso en memoria que cumple el puerto: roles y usuarios conocidos, y lo que se escribió. */
function repositorioFalso(
  roles: string[],
  usuarios: { id: string; email: string; rol: string }[] = [],
) {
  const creados: NuevoUsuario[] = [];
  const cambios: { userId: string; roleId: string }[] = [];
  const repo: UsersRepository = {
    buscarRolPorNombre: (nombre) =>
      Promise.resolve(roles.includes(nombre) ? { id: `rol-${nombre}` } : null),
    buscarUsuarioPorCorreo: (correo) =>
      Promise.resolve(usuarios.find((usuario) => usuario.email === correo) ?? null),
    crearUsuario: (usuario) => {
      creados.push(usuario);
      return Promise.resolve();
    },
    cambiarRol: (userId, roleId) => {
      cambios.push({ userId, roleId });
      return Promise.resolve();
    },
  };
  return { repo, creados, cambios };
}

const hasher = {
  hash: (password: string) => Promise.resolve(`hash(${password})`),
  verify: () => Promise.resolve(false),
};

function servicio(repo: UsersRepository) {
  return createUsersService({ repo, hasher, reloj: relojFijo(), ids: () => 'id-nuevo' });
}

describe('UsersService', () => {
  it('guarda el hash y nunca la contraseña cuando crea un usuario', async () => {
    const { repo, creados } = repositorioFalso(['doctor']);

    const usuario = await servicio(repo).crear({
      email: 'a@test.local',
      rol: 'doctor',
      password: 'secreto',
    });

    expect(usuario).toEqual({ id: 'id-nuevo', email: 'a@test.local', rol: 'doctor' });
    expect(creados).toHaveLength(1);
    expect(creados[0]?.passwordHash).toBe('hash(secreto)');
    expect(JSON.stringify(creados)).not.toContain('"secreto"');
  });

  it('lanza RolInexistenteError sin crear nada cuando el rol no existe', async () => {
    const { repo, creados } = repositorioFalso(['doctor']);

    await expect(
      servicio(repo).crear({ email: 'a@test.local', rol: 'superusuario', password: 'x' }),
    ).rejects.toBeInstanceOf(RolInexistenteError);
    expect(creados).toHaveLength(0);
  });

  it('cambia el rol del usuario existente cuando set-role recibe un rol válido', async () => {
    const { repo, cambios } = repositorioFalso(
      ['doctor', 'admin'],
      [{ id: 'u1', email: 'a@test.local', rol: 'doctor' }],
    );

    const usuario = await servicio(repo).cambiarRol({ email: 'a@test.local', rol: 'admin' });

    expect(usuario).toEqual({ id: 'u1', email: 'a@test.local', rol: 'admin' });
    expect(cambios).toEqual([{ userId: 'u1', roleId: 'rol-admin' }]);
  });

  it('lanza UsuarioInexistenteError cuando set-role no encuentra el correo', async () => {
    const { repo } = repositorioFalso(['admin']);

    await expect(
      servicio(repo).cambiarRol({ email: 'nadie@test.local', rol: 'admin' }),
    ).rejects.toBeInstanceOf(UsuarioInexistenteError);
  });
});
