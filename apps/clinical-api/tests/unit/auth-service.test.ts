import { describe, expect, it } from 'vitest';
import type {
  AuthRepository,
  NuevaSesion,
  UsuarioParaLogin,
} from '../../src/modules/auth/auth.repository.js';
import {
  createAuthService,
  CredencialesInvalidasError,
  hashDeToken,
} from '../../src/modules/auth/auth.service.js';
import type { PasswordHasher } from '../../src/modules/auth/password-hasher.js';
import { relojFijo, tokensFijos } from '../support/usuarios.js';

const CORREO = 'ana@test.local';
const CONTRASENA = 'SINT-contrasena-correcta';

/** Hasher falso que cumple el contrato del real: `verify` es verdadero solo con el hash de esa contraseña. */
function hasherFalso(): PasswordHasher & { verificaciones: string[] } {
  const verificaciones: string[] = [];
  return {
    verificaciones,
    hash: (password) => Promise.resolve(`hash(${password})`),
    verify: (hash, password) => {
      verificaciones.push(hash);
      return Promise.resolve(hash === `hash(${password})`);
    },
  };
}

function repositorioFalso(usuarios: Record<string, UsuarioParaLogin>) {
  const sesiones: NuevaSesion[] = [];
  const consultados: string[] = [];
  const fallos: { userId: string; ahora: string; maxIntentos: number; minutosDeBloqueo: number }[] =
    [];
  const reinicios: string[] = [];
  const repo: AuthRepository = {
    buscarUsuarioPorCorreo: (correo) => {
      consultados.push(correo);
      return Promise.resolve(usuarios[correo] ?? null);
    },
    crearSesion: (sesion) => {
      sesiones.push(sesion);
      return Promise.resolve(true);
    },
    registrarFalloDeLogin: (userId, ahora, parametros) => {
      fallos.push({ userId, ahora: ahora.toISOString(), ...parametros });
      return Promise.resolve();
    },
    reiniciarFallos: (userId) => {
      reinicios.push(userId);
      return Promise.resolve();
    },
    buscarSesionPorTokenHash: () => Promise.resolve(null),
    revocarSesion: () => Promise.resolve(),
  };
  return { repo, sesiones, consultados, fallos, reinicios };
}

function crearServicio(usuarios: Record<string, UsuarioParaLogin>) {
  const hasher = hasherFalso();
  const { repo, sesiones, consultados, fallos, reinicios } = repositorioFalso(usuarios);
  const service = createAuthService({
    repo,
    hasher,
    tokens: tokensFijos('token-uno'),
    ids: () => 'sesion-1',
    reloj: relojFijo('2026-10-16T12:00:00.000Z'),
    config: { sessionTtlHours: 8 },
    sesion: { loginMaxFailedAttempts: 5, loginLockoutMinutes: 15 },
  });
  return { service, hasher, sesiones, consultados, fallos, reinicios };
}

const activo: UsuarioParaLogin = {
  id: 'usuario-1',
  passwordHash: `hash(${CONTRASENA})`,
  accountStatus: 'activo',
  rol: 'doctor',
  lockedUntil: null,
};

describe('hashDeToken', () => {
  it('devuelve el SHA-256 en hexadecimal del token', () => {
    expect(hashDeToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('AuthService.iniciarSesion', () => {
  it('guarda la sesión con el hash del token y no con el token cuando las credenciales son correctas', async () => {
    const { service, sesiones } = crearServicio({ [CORREO]: activo });

    const { token } = await service.iniciarSesion({ email: CORREO, password: CONTRASENA });

    expect(token).toBe('token-uno');
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]).toMatchObject({
      id: 'sesion-1',
      userId: activo.id,
      tokenHash: hashDeToken('token-uno'),
    });
    expect(JSON.stringify(sesiones[0])).not.toContain('token-uno');
  });

  it('fija expires_at en reloj + SESSION_TTL_HOURS cuando crea la sesión', async () => {
    const { service, sesiones } = crearServicio({ [CORREO]: activo });

    await service.iniciarSesion({ email: CORREO, password: CONTRASENA });

    expect(sesiones[0]?.expiresAt.toISOString()).toBe('2026-10-16T20:00:00.000Z');
    expect(sesiones[0]?.lastSeenAt.toISOString()).toBe('2026-10-16T12:00:00.000Z');
  });

  it('busca el correo normalizado (sin espacios y en minúsculas)', async () => {
    const { service, consultados } = crearServicio({ [CORREO]: activo });

    await service.iniciarSesion({ email: '  ANA@Test.local ', password: CONTRASENA });

    expect(consultados).toEqual(['ana@test.local']);
  });

  it('rechaza con CredencialesInvalidasError y verifica contra el hash señuelo cuando el correo no existe', async () => {
    const { service, hasher, sesiones } = crearServicio({ [CORREO]: activo });

    await expect(
      service.iniciarSesion({ email: 'nadie@test.local', password: CONTRASENA }),
    ).rejects.toBeInstanceOf(CredencialesInvalidasError);

    expect(hasher.verificaciones).toEqual([`hash(señuelo)`]);
    expect(sesiones).toEqual([]);
  });

  it.each(['pendiente', 'desactivado', 'rechazado'] as const)(
    'rechaza con el mismo error y verifica el hash real cuando la cuenta está %s',
    async (accountStatus) => {
      const inhabilitado: UsuarioParaLogin = { ...activo, accountStatus };
      const { service, hasher, sesiones } = crearServicio({ [CORREO]: inhabilitado });

      await expect(
        service.iniciarSesion({ email: CORREO, password: CONTRASENA }),
      ).rejects.toBeInstanceOf(CredencialesInvalidasError);

      expect(hasher.verificaciones).toEqual([activo.passwordHash]);
      expect(sesiones).toEqual([]);
    },
  );

  it('rechaza con CredencialesInvalidasError cuando la contraseña es incorrecta', async () => {
    const { service, sesiones } = crearServicio({ [CORREO]: activo });

    await expect(service.iniciarSesion({ email: CORREO, password: 'otra' })).rejects.toBeInstanceOf(
      CredencialesInvalidasError,
    );

    expect(sesiones).toEqual([]);
  });
});

describe('AuthService.iniciarSesion y el bloqueo de la cuenta', () => {
  it('registra un fallo con el umbral y el plazo de la configuración cuando la contraseña es incorrecta', async () => {
    const { service, fallos } = crearServicio({ [CORREO]: activo });

    await expect(service.iniciarSesion({ email: CORREO, password: 'otra' })).rejects.toThrow();

    expect(fallos).toEqual([
      {
        userId: activo.id,
        ahora: '2026-10-16T12:00:00.000Z',
        maxIntentos: 5,
        minutosDeBloqueo: 15,
      },
    ]);
  });

  it('no registra fallos cuando el correo no existe ni cuando la cuenta no está activa con la contraseña correcta', async () => {
    const desactivado: UsuarioParaLogin = { ...activo, accountStatus: 'desactivado' };
    const { service, fallos } = crearServicio({ [CORREO]: desactivado });

    await expect(
      service.iniciarSesion({ email: 'nadie@test.local', password: CONTRASENA }),
    ).rejects.toThrow();
    await expect(service.iniciarSesion({ email: CORREO, password: CONTRASENA })).rejects.toThrow();

    expect(fallos).toEqual([]);
  });

  it('reinicia los fallos de la cuenta cuando el login es correcto', async () => {
    const { service, reinicios } = crearServicio({ [CORREO]: activo });

    await service.iniciarSesion({ email: CORREO, password: CONTRASENA });

    expect(reinicios).toEqual([activo.id]);
  });

  it('rechaza con motivo bloqueo_cuenta, verifica el hash señuelo y no crea sesión ni cuenta el fallo cuando la cuenta está bloqueada', async () => {
    const bloqueado: UsuarioParaLogin = {
      ...activo,
      lockedUntil: new Date('2026-10-16T12:00:00.001Z'),
    };
    const { service, hasher, sesiones, fallos, reinicios } = crearServicio({ [CORREO]: bloqueado });

    const error = await service
      .iniciarSesion({ email: CORREO, password: CONTRASENA })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CredencialesInvalidasError);
    expect((error as CredencialesInvalidasError).motivo).toBe('bloqueo_cuenta');
    expect(hasher.verificaciones).toEqual(['hash(señuelo)']);
    expect(sesiones).toEqual([]);
    expect(fallos).toEqual([]);
    expect(reinicios).toEqual([]);
  });

  it('inicia sesión cuando el reloj coincide exactamente con locked_until', async () => {
    const venceAhora: UsuarioParaLogin = {
      ...activo,
      lockedUntil: new Date('2026-10-16T12:00:00.000Z'),
    };
    const { service } = crearServicio({ [CORREO]: venceAhora });

    await expect(service.iniciarSesion({ email: CORREO, password: CONTRASENA })).resolves.toEqual({
      token: 'token-uno',
    });
  });

  it('rechaza con el mismo error y sin devolver token cuando la cuenta dejó de estar activa al crear la sesión', async () => {
    const hasher = hasherFalso();
    const { repo } = repositorioFalso({ [CORREO]: activo });
    const service = createAuthService({
      repo: { ...repo, crearSesion: () => Promise.resolve(false) },
      hasher,
      tokens: tokensFijos('token-uno'),
      ids: () => 'sesion-1',
      reloj: relojFijo('2026-10-16T12:00:00.000Z'),
      config: { sessionTtlHours: 8 },
      sesion: { loginMaxFailedAttempts: 5, loginLockoutMinutes: 15 },
    });

    await expect(
      service.iniciarSesion({ email: CORREO, password: CONTRASENA }),
    ).rejects.toBeInstanceOf(CredencialesInvalidasError);
  });
});
