import { createRegistroDeIntentosPorIp } from '../../src/infrastructure/intentos-por-ip.memoria.js';
import type { Clock } from '../../src/infrastructure/clock.js';
import { relojFijo } from './usuarios.js';

/** Registro por IP real en memoria (lógica propia, sin E/S) con los valores de test: 5 fallos en 15 minutos. */
export function registroDeIntentosDeTest(reloj: Clock = relojFijo()) {
  return createRegistroDeIntentosPorIp({ reloj, maxIntentos: 5, ventanaMinutos: 15 });
}

/** Configuración de sesión y bloqueo de los unitarios de `AuthService` (los valores del diseño). */
export const SESION_DE_TEST = {
  loginMaxFailedAttempts: 5,
  loginLockoutMinutes: 15,
  idleMinutes: 30,
  touchSeconds: 60,
};
