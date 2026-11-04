import { pacienteA } from './a.js';
import { pacienteB } from './b.js';
import { pacienteC } from './c.js';
import { pacienteD } from './d.js';
import { pacienteE } from './e.js';
import { pacienteF } from './f.js';
import { pacienteG } from './g.js';
import { pacienteH } from './h.js';
import { pacienteI } from './i.js';
import { pacienteJ } from './j.js';
import { pacienteK } from './k.js';
import { pacienteL } from './l.js';
import { pacienteM } from './m.js';
import type { PacienteSemilla } from './tipos.js';

/**
 * Los pacientes semilla, en el orden del seed (el ordinal de la identidad sintética es su posición + 1): (a)–(f) son los
 * anteriores a US-254 y (g)–(m) son los momentos de la enfermedad (ordinales 7–13). Sin
 * dependencias de la aplicación: los tests de integración y los E2E leen de aquí cuántos hay, en vez de repetir el número.
 */
export const PACIENTES_SEMILLA: readonly PacienteSemilla[] = [
  pacienteA,
  pacienteB,
  pacienteC,
  pacienteD,
  pacienteE,
  pacienteF,
  pacienteG,
  pacienteH,
  pacienteI,
  pacienteJ,
  pacienteK,
  pacienteL,
  pacienteM,
];
