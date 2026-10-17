import { describe, expect, it } from 'vitest';
import type { SesionConUsuario } from '../../src/modules/auth/auth.repository.js';
import { createAuthService, hashDeToken } from '../../src/modules/auth/auth.service.js';
import { tokenDeCookie } from '../../src/middleware/auth.js';
import { relojFijo, tokensFijos } from '../support/usuarios.js';

const AHORA = '2026-10-16T12:00:00.000Z';

const vigente: SesionConUsuario = {
  userId: 'usuario-1',
  rol: 'doctor',
  accountStatus: 'activo',
  expiresAt: new Date('2026-10-16T20:00:00.000Z'),
  revoked: false,
};

/** Servicio con un repository falso que solo conoce la sesión de `tokenConocido`. */
function servicioCon(sesion: SesionConUsuario | null) {
  const consultas: string[] = [];
  const service = createAuthService({
    repo: {
      buscarUsuarioPorCorreo: () => Promise.resolve(null),
      crearSesion: () => Promise.resolve(),
      buscarSesionPorTokenHash: (hash) => {
        consultas.push(hash);
        return Promise.resolve(hash === hashDeToken('tokenConocido') ? sesion : null);
      },
    },
    hasher: { hash: () => Promise.resolve('h'), verify: () => Promise.resolve(false) },
    tokens: tokensFijos('t'),
    ids: () => 'id',
    reloj: relojFijo(AHORA),
    config: { sessionTtlHours: 8 },
  });
  return { service, consultas };
}

describe('AuthService.resolverSesion', () => {
  it('devuelve userId y rol cuando la sesión está vigente y la cuenta activa', async () => {
    const { service } = servicioCon(vigente);

    expect(await service.resolverSesion('tokenConocido')).toEqual({
      userId: 'usuario-1',
      rol: 'doctor',
    });
  });

  it('consulta por el hash del token y nunca por el token en claro', async () => {
    const { service, consultas } = servicioCon(vigente);

    await service.resolverSesion('tokenConocido');

    expect(consultas).toEqual([hashDeToken('tokenConocido')]);
  });

  it('devuelve null cuando el token no corresponde a ninguna sesión', async () => {
    const { service } = servicioCon(vigente);

    expect(await service.resolverSesion('tokenDesconocido')).toBeNull();
  });

  it('devuelve null cuando expires_at es el instante actual o anterior', async () => {
    const enElLimite = servicioCon({ ...vigente, expiresAt: new Date(AHORA) });
    const pasada = servicioCon({ ...vigente, expiresAt: new Date('2026-10-16T11:59:59.999Z') });

    expect(await enElLimite.service.resolverSesion('tokenConocido')).toBeNull();
    expect(await pasada.service.resolverSesion('tokenConocido')).toBeNull();
  });

  it('devuelve null cuando la sesión está revocada', async () => {
    const { service } = servicioCon({ ...vigente, revoked: true });

    expect(await service.resolverSesion('tokenConocido')).toBeNull();
  });

  it.each(['pendiente', 'desactivado', 'rechazado'] as const)(
    'devuelve null cuando la cuenta está %s',
    async (accountStatus) => {
      const { service } = servicioCon({ ...vigente, accountStatus });

      expect(await service.resolverSesion('tokenConocido')).toBeNull();
    },
  );
});

describe('tokenDeCookie', () => {
  it('devuelve el valor de oncolens_session entre otras cookies', () => {
    expect(tokenDeCookie('tema=oscuro; oncolens_session=abc123; otra=1')).toBe('abc123');
  });

  it('devuelve undefined cuando la cabecera falta o no trae la cookie de sesión', () => {
    expect(tokenDeCookie(undefined)).toBeUndefined();
    expect(tokenDeCookie('tema=oscuro')).toBeUndefined();
    expect(tokenDeCookie('oncolens_session=')).toBeUndefined();
  });

  it('usa la primera aparición cuando la cookie de sesión viene repetida', () => {
    expect(tokenDeCookie('oncolens_session=uno; oncolens_session=dos')).toBe('uno');
  });

  it('conserva un valor con signo igual', () => {
    expect(tokenDeCookie('oncolens_session=a=b')).toBe('a=b');
  });
});
