import type { Express, Router } from 'express';
import { createApp } from './app.js';
import type { AuthConfig, SesionConfig } from './config/index.js';
import type { Clock } from './infrastructure/clock.js';
import type { GeneradorDeIds } from './infrastructure/ids.js';
import type { Registrar } from './infrastructure/logger.js';
import type { InformacionDeSalud } from './routes/health.js';
import { createRegistroDeIntentosPorIp } from './infrastructure/intentos-por-ip.memoria.js';
import { createAuthRepository, type Consultador } from './modules/auth/auth.repository.js';
import { logoutController } from './modules/auth/auth.controller.js';
import { createAuthService, type GeneradorDeToken } from './modules/auth/auth.service.js';
import { createPasswordHasher } from './modules/auth/password-hasher.js';

/** Routers de dominio que exigen sesión. Cada historia añade el suyo aquí. */
export interface RoutersProtegidos {
  gateway: Router;
  /** Carga de documentos (L1D-56). Obligatorio: olvidarlo en `server.ts` rompe el build. */
  documents: Router;
}

/**
 * ÚNICO lugar donde se decide qué routers van detrás del guard: lo usan `server.ts` y los tests, de modo que el test de
 * coherencia ruta ↔ contrato (US-045 AC-3) recorre los mismos routers que producción.
 */
export function componerRutasProtegidas(routers: RoutersProtegidos): readonly Router[] {
  return [routers.gateway, routers.documents];
}

export interface DependenciasDeComposicion {
  db: Consultador;
  auth: AuthConfig;
  /** Inactividad, bloqueo del login y saltos de proxy de confianza (RN-22, US-044). */
  sesion: SesionConfig;
  reloj: Clock;
  tokens: GeneradorDeToken;
  ids: GeneradorDeIds;
  nuevoTraceId: () => string;
  registrar: Registrar;
  /** Routers que exigen sesión (gateway de análisis, pacientes...): se montan después del guard. */
  rutasProtegidas?: readonly Router[];
  /** Nombres de claves de configuración y versión que expone `/health` (US-037). */
  salud?: InformacionDeSalud;
}

/**
 * Raíz de composición del módulo de sesión: el repository recibe la conexión, el service recibe sus puertos y la
 * aplicación monta login → guard → resto (design D5, D11). No lee el entorno: lo hace `server.ts`.
 */
export function componerAplicacion(dependencias: DependenciasDeComposicion): Express {
  const service = createAuthService({
    repo: createAuthRepository(dependencias.db),
    hasher: createPasswordHasher(dependencias.auth.argon2),
    tokens: dependencias.tokens,
    ids: dependencias.ids,
    reloj: dependencias.reloj,
    config: dependencias.auth,
    sesion: dependencias.sesion,
    registroDeIntentosPorIp: createRegistroDeIntentosPorIp({
      reloj: dependencias.reloj,
      maxIntentos: dependencias.sesion.loginMaxFailedAttempts,
      ventanaMinutos: dependencias.sesion.loginLockoutMinutes,
    }),
  });
  return createApp({
    trustProxyHops: dependencias.sesion.trustProxyHops,
    ...(dependencias.salud !== undefined && { salud: dependencias.salud }),
    plataforma: {
      auth: {
        service,
        nuevoTraceId: dependencias.nuevoTraceId,
        registrar: dependencias.registrar,
      },
      // El logout va detrás del guard y antes de los routers de dominio; `app.ts` no conoce ninguna ruta concreta.
      rutasProtegidas: [
        logoutController({
          service,
          nuevoTraceId: dependencias.nuevoTraceId,
          registrar: dependencias.registrar,
        }),
        ...(dependencias.rutasProtegidas ?? []),
      ],
    },
  });
}
