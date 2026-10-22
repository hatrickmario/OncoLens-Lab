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
  type RegistroDeIntentosPorIp,
} from '../../src/modules/auth/auth.service.js';
import type { PasswordHasher } from '../../src/modules/auth/password-hasher.js';
import { registroDeIntentosDeTest, SESION_DE_TEST } from '../support/intentos-por-ip.js';
import { relojFijo, tokensFijos } from '../support/usuarios.js';

const CORREO = 'ana@test.local';
const CONTRASENA = 'SINT-contrasena-correcta';

/** Hasher falso que cumple el contrato del real: `verify` es verdadero solo con el hash de esa contraseña. */
function hasherFalso(eventos: string[] = []): PasswordHasher & { verificaciones: string[] } {
  const verificaciones: string[] = [];
  return {
    verificaciones,
    hash: (password) => Promise.resolve(`hash(${password})`),
    verify: (hash, password) => {
      verificaciones.push(hash);
      eventos.push('verificacion');
      return Promise.resolve(hash === `hash(${password})`);
    },
  };
}

interface ReservaDeCuentaRegistrada {
  userId: string;
  ahora: string;
  maxIntentos: number;
  minutosDeBloqueo: number;
}

function repositorioFalso(usuarios: Record<string, UsuarioParaLogin>, eventos: string[] = []) {
  const sesiones: NuevaSesion[] = [];
  const consultados: string[] = [];
  const reservas: ReservaDeCuentaRegistrada[] = [];
  const reinicios: { userId: string; intentos: number }[] = [];
  const repo: AuthRepository = {
    buscarUsuarioPorCorreo: (correo) => {
      consultados.push(correo);
      return Promise.resolve(usuarios[correo] ?? null);
    },
    crearSesion: (sesion) => {
      sesiones.push(sesion);
      return Promise.resolve(true);
    },
    // Cumple el contrato del real: no cuenta ni permite mientras `locked_until` sea posterior al reloj.
    reservarIntentoDeLogin: (userId, ahora, parametros) => {
      eventos.push('reserva');
      reservas.push({ userId, ahora: ahora.toISOString(), ...parametros });
      const bloqueada = Object.values(usuarios).some(
        (u) => u.id === userId && u.lockedUntil !== null && u.lockedUntil > ahora,
      );
      return Promise.resolve({ permitido: !bloqueada, intentos: reservas.length });
    },
    reiniciarFallos: (userId, intentos) => {
      reinicios.push({ userId, intentos });
      return Promise.resolve();
    },
    buscarSesionPorTokenHash: () => Promise.resolve(null),
    revocarSesion: () => Promise.resolve(),
    tocarSesion: () => Promise.resolve(),
  };
  return { repo, sesiones, consultados, reservas, reinicios };
}

function crearServicio(usuarios: Record<string, UsuarioParaLogin>) {
  const eventos: string[] = [];
  const hasher = hasherFalso(eventos);
  const { repo, sesiones, consultados, reservas, reinicios } = repositorioFalso(usuarios, eventos);
  const service = createAuthService({
    repo,
    hasher,
    tokens: tokensFijos('token-uno'),
    ids: () => 'sesion-1',
    reloj: relojFijo('2026-10-16T12:00:00.000Z'),
    config: { sessionTtlHours: 8 },
    sesion: SESION_DE_TEST,
    registroDeIntentosPorIp: registroDeIntentosDeTest(),
  });
  return { service, hasher, sesiones, consultados, reservas, reinicios, eventos };
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
  it('reserva el intento con el umbral y el plazo de la configuración ANTES de verificar la contraseña', async () => {
    const { service, reservas, eventos } = crearServicio({ [CORREO]: activo });

    await expect(service.iniciarSesion({ email: CORREO, password: 'otra' })).rejects.toThrow();

    expect(reservas).toEqual([
      {
        userId: activo.id,
        ahora: '2026-10-16T12:00:00.000Z',
        maxIntentos: 5,
        minutosDeBloqueo: 15,
      },
    ]);
    expect(eventos).toEqual(['reserva', 'verificacion']);
  });

  it('no reserva intentos cuando el correo no existe ni cuando la cuenta no está activa', async () => {
    const desactivado: UsuarioParaLogin = { ...activo, accountStatus: 'desactivado' };
    const { service, reservas } = crearServicio({ [CORREO]: desactivado });

    await expect(
      service.iniciarSesion({ email: 'nadie@test.local', password: CONTRASENA }),
    ).rejects.toThrow();
    await expect(service.iniciarSesion({ email: CORREO, password: CONTRASENA })).rejects.toThrow();

    expect(reservas).toEqual([]);
  });

  it('reinicia los fallos con el conteo que reservó cuando el login es correcto', async () => {
    const { service, reinicios } = crearServicio({ [CORREO]: activo });

    await service.iniciarSesion({ email: CORREO, password: CONTRASENA });

    expect(reinicios).toEqual([{ userId: activo.id, intentos: 1 }]);
  });

  it('no reinicia los fallos cuando la contraseña es incorrecta', async () => {
    const { service, reinicios } = crearServicio({ [CORREO]: activo });

    await expect(service.iniciarSesion({ email: CORREO, password: 'otra' })).rejects.toThrow();

    expect(reinicios).toEqual([]);
  });

  it('rechaza con motivo bloqueo_cuenta, verifica el hash señuelo y no reserva ni crea sesión cuando la cuenta ya figura bloqueada', async () => {
    const bloqueado: UsuarioParaLogin = {
      ...activo,
      lockedUntil: new Date('2026-10-16T12:00:00.001Z'),
    };
    const { service, hasher, sesiones, reservas, reinicios } = crearServicio({
      [CORREO]: bloqueado,
    });

    const error = await service
      .iniciarSesion({ email: CORREO, password: CONTRASENA })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CredencialesInvalidasError);
    expect((error as CredencialesInvalidasError).motivo).toBe('bloqueo_cuenta');
    expect(hasher.verificaciones).toEqual(['hash(señuelo)']);
    expect(sesiones).toEqual([]);
    expect(reservas).toEqual([]);
    expect(reinicios).toEqual([]);
  });

  it('rechaza con bloqueo_cuenta y el hash señuelo cuando la reserva atómica deniega aunque la lectura previa no mostraba bloqueo', async () => {
    const hasher = hasherFalso();
    const { repo, sesiones, reinicios } = repositorioFalso({ [CORREO]: activo });
    const service = createAuthService({
      repo: {
        ...repo,
        reservarIntentoDeLogin: () => Promise.resolve({ permitido: false, intentos: 5 }),
      },
      hasher,
      tokens: tokensFijos('token-uno'),
      ids: () => 'sesion-1',
      reloj: relojFijo('2026-10-16T12:00:00.000Z'),
      config: { sessionTtlHours: 8 },
      sesion: SESION_DE_TEST,
      registroDeIntentosPorIp: registroDeIntentosDeTest(),
    });

    const error = await service
      .iniciarSesion({ email: CORREO, password: CONTRASENA })
      .catch((e: unknown) => e);

    expect((error as CredencialesInvalidasError).motivo).toBe('bloqueo_cuenta');
    expect(hasher.verificaciones).toEqual(['hash(señuelo)']);
    expect(sesiones).toEqual([]);
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
      sesion: SESION_DE_TEST,
      registroDeIntentosPorIp: registroDeIntentosDeTest(),
    });

    await expect(
      service.iniciarSesion({ email: CORREO, password: CONTRASENA }),
    ).rejects.toBeInstanceOf(CredencialesInvalidasError);
  });
});

describe('AuthService.iniciarSesion y el bloqueo por IP', () => {
  const IP = '198.51.100.7';

  function registroFalso(bloqueadas: string[] = []) {
    const reservadas: string[] = [];
    const liberadas: string[] = [];
    const registro: RegistroDeIntentosPorIp = {
      reservar: (ip) => {
        if (bloqueadas.includes(ip)) return null;
        reservadas.push(ip);
        return { liberar: () => void liberadas.push(ip) };
      },
    };
    return { registro, reservadas, liberadas };
  }

  function servicioConRegistro(registro: RegistroDeIntentosPorIp) {
    const eventos: string[] = [];
    const { repo, sesiones, reservas } = repositorioFalso({ [CORREO]: activo }, eventos);
    const hasher = hasherFalso(eventos);
    const service = createAuthService({
      repo,
      hasher,
      tokens: tokensFijos('token-uno'),
      ids: () => 'sesion-1',
      reloj: relojFijo('2026-10-16T12:00:00.000Z'),
      config: { sessionTtlHours: 8 },
      sesion: SESION_DE_TEST,
      registroDeIntentosPorIp: registro,
    });
    return { service, hasher, sesiones, reservas };
  }

  it('reserva un intento contra la IP y lo conserva cuando la contraseña es incorrecta o el correo no existe', async () => {
    const { registro, reservadas, liberadas } = registroFalso();
    const { service } = servicioConRegistro(registro);

    await expect(service.iniciarSesion({ email: CORREO, password: 'otra' }, IP)).rejects.toThrow();
    await expect(
      service.iniciarSesion({ email: 'nadie@test.local', password: 'x' }, IP),
    ).rejects.toThrow();

    expect(reservadas).toEqual([IP, IP]);
    expect(liberadas).toEqual([]);
  });

  it('libera la reserva de la IP cuando el login es correcto', async () => {
    const { registro, reservadas, liberadas } = registroFalso();
    const { service } = servicioConRegistro(registro);

    await service.iniciarSesion({ email: CORREO, password: CONTRASENA }, IP);

    expect(reservadas).toEqual([IP]);
    expect(liberadas).toEqual([IP]);
  });

  it('rechaza con motivo bloqueo_ip, verifica el hash señuelo y no reserva intentos de la cuenta cuando la IP está bloqueada', async () => {
    const { registro } = registroFalso([IP]);
    const { service, hasher, sesiones, reservas } = servicioConRegistro(registro);

    const error = await service
      .iniciarSesion({ email: CORREO, password: CONTRASENA }, IP)
      .catch((e: unknown) => e);

    expect((error as CredencialesInvalidasError).motivo).toBe('bloqueo_ip');
    expect(hasher.verificaciones).toEqual(['hash(señuelo)']);
    expect(sesiones).toEqual([]);
    expect(reservas).toEqual([]);
  });

  it('libera la reserva de la IP cuando la cuenta está bloqueada, porque ese intento no cuenta contra la IP', async () => {
    const { registro, liberadas } = registroFalso();
    const bloqueado: UsuarioParaLogin = {
      ...activo,
      lockedUntil: new Date('2026-10-16T12:00:00.001Z'),
    };
    const { repo } = repositorioFalso({ [CORREO]: bloqueado });
    const service = createAuthService({
      repo,
      hasher: hasherFalso(),
      tokens: tokensFijos('token-uno'),
      ids: () => 'sesion-1',
      reloj: relojFijo('2026-10-16T12:00:00.000Z'),
      config: { sessionTtlHours: 8 },
      sesion: SESION_DE_TEST,
      registroDeIntentosPorIp: registro,
    });

    await expect(
      service.iniciarSesion({ email: CORREO, password: CONTRASENA }, IP),
    ).rejects.toThrow();

    expect(liberadas).toEqual([IP]);
  });

  it('inicia sesión sin consultar el registro cuando no hay IP atribuible', async () => {
    const { registro, reservadas } = registroFalso([IP]);
    const { service } = servicioConRegistro(registro);

    await expect(service.iniciarSesion({ email: CORREO, password: CONTRASENA })).resolves.toEqual({
      token: 'token-uno',
    });
    expect(reservadas).toEqual([]);
  });
});
