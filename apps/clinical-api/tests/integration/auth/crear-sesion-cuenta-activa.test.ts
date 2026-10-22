import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAuthRepository } from '../../../src/modules/auth/auth.repository.js';
import { conectar } from '../../support/db.js';
import { INSTANTE_FIJO } from '../../support/filas-sinteticas.js';
import {
  contarSesiones,
  crearUsuariosDeAuth,
  limpiarUsuarios,
  type UsuarioDeTest,
} from '../../support/usuarios.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 1985;

let cliente: Client;
let doc1: UsuarioDeTest;
let doc2Desactivado: UsuarioDeTest;
let siguiente = 0;

beforeAll(async () => {
  cliente = await conectar(urlBase);
  ({ doc1, doc2Desactivado } = await crearUsuariosDeAuth(cliente, ESPACIO_DE_IDS));
});

afterAll(async () => {
  await limpiarUsuarios(cliente, [doc1.id, doc2Desactivado.id]);
  await cliente.end();
});

function sesionDe(userId: string) {
  siguiente += 1;
  const id = `0000${ESPACIO_DE_IDS}-0000-4000-8000-${String(siguiente).padStart(12, '0')}`;
  const instante = new Date(INSTANTE_FIJO);
  return {
    id,
    userId,
    tokenHash: `hash-${ESPACIO_DE_IDS}-${siguiente}`,
    expiresAt: new Date(instante.getTime() + 3_600_000),
    lastSeenAt: instante,
    createdAt: instante,
  };
}

describe('AuthRepository.crearSesion', () => {
  it('crea la sesión y devuelve true cuando la cuenta está activa', async () => {
    const repo = createAuthRepository(cliente);

    expect(await repo.crearSesion(sesionDe(doc1.id))).toBe(true);

    expect(await contarSesiones(cliente, [doc1.id])).toBe(1);
  });

  it('no crea la sesión y devuelve false cuando la cuenta dejó de estar activa', async () => {
    const repo = createAuthRepository(cliente);

    expect(await repo.crearSesion(sesionDe(doc2Desactivado.id))).toBe(false);

    expect(await contarSesiones(cliente, [doc2Desactivado.id])).toBe(0);
  });
});
