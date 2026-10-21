import type { Client } from 'pg';
import type { GeneradorDeIds } from './filas-sinteticas.js';
import { insertarSesion, insertarUsuario, type UsuarioDeTest } from './usuarios.js';

/**
 * Roles y permisos de PRUEBA: viven solo en los tests. `asegurarPermisos` los crea en una base sin seed;
 * `crearRolDePrueba` exige que ya existan (los siembra el seed o `asegurarPermisos`).
 */
export async function asegurarPermisos(
  cliente: Client,
  ids: GeneradorDeIds,
  codigos: string[],
): Promise<void> {
  for (const codigo of codigos) {
    await cliente.query(
      `INSERT INTO auth.permission (id, code, description) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO NOTHING`,
      [ids(), codigo, `Permiso de prueba ${codigo}`],
    );
  }
}

/** Rol con permisos acotados (design D6); si falta algún permiso en `auth.permission`, falla nombrándolo. */
export async function crearRolDePrueba(
  cliente: Client,
  ids: GeneradorDeIds,
  nombre: string,
  codigos: string[],
): Promise<string> {
  const rol = await cliente.query<{ id: string }>(
    `INSERT INTO auth.role (id, name, description) VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description RETURNING id`,
    [ids(), nombre, `Rol de prueba ${nombre}`],
  );
  const rolId = rol.rows[0]?.id ?? '';
  const permisos = await cliente.query<{ id: string; code: string }>(
    'SELECT id, code FROM auth.permission WHERE code = ANY($1)',
    [codigos],
  );
  const faltantes = codigos.filter((codigo) => !permisos.rows.some((fila) => fila.code === codigo));
  if (faltantes.length > 0) {
    throw new Error(`el seed no sembró los permisos: ${faltantes.join(', ')}`);
  }
  for (const permiso of permisos.rows) {
    await cliente.query(
      'INSERT INTO auth.role_permission (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [rolId, permiso.id],
    );
  }
  return rolId;
}

/** Usuario activo con ese rol y una sesión vigente: devuelve la cabecera `Cookie` lista para Supertest. */
export async function abrirSesionDeUsuarioConRol(
  cliente: Client,
  ids: GeneradorDeIds,
  opciones: { email: string; password: string; rolId: string; tokenHash: string; token: string },
): Promise<{ usuario: UsuarioDeTest; cookie: string }> {
  const usuario = await insertarUsuario(cliente, ids, {
    email: opciones.email,
    password: opciones.password,
    rolId: opciones.rolId,
  });
  await insertarSesion(cliente, ids, {
    userId: usuario.id,
    tokenHash: opciones.tokenHash,
    expiresAt: '2026-10-16T20:00:00.000Z',
  });
  return { usuario, cookie: `oncolens_session=${opciones.token}` };
}
