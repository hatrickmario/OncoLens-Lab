import { pacienteA } from './a.js';
import { pacienteB } from './b.js';
import { pacienteC } from './c.js';
import { pacienteD } from './d.js';
import { pacienteE } from './e.js';
import { pacienteF } from './f.js';
import type { PacienteSemilla } from './tipos.js';

/**
 * Los pacientes semilla, en el orden del seed (el ordinal de la identidad sintética es su posición + 1). Sin
 * dependencias de la aplicación: los tests de integración y los E2E leen de aquí cuántos hay, en vez de repetir el número.
 */
export const PACIENTES_SEMILLA: readonly PacienteSemilla[] = [
  pacienteA,
  pacienteB,
  pacienteC,
  pacienteD,
  pacienteE,
  pacienteF,
];
