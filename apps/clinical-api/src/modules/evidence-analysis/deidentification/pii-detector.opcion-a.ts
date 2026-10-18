import type { IdentidadDelPaciente, PiiDetector } from '../ports.js';
import type { ConfiguracionDePii } from './pii-formats.config.js';

/** Detector de la opción A de ADR-40: identidad conocida + formatos configurados (L1D-166). */
export function crearDetectorOpcionA(
  identidad: IdentidadDelPaciente | null,
  configuracion: ConfiguracionDePii,
): PiiDetector {
  void identidad;
  void configuracion;
  throw new Error('no implementado');
}
