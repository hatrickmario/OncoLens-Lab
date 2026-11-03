import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { DecisionDeNormalizacion } from '../reconciliation/ports.js';
import type {
  BiomarcadorActual,
  ExamenDeCorreccionAGuardar,
  NotaActual,
  PlanDeCorreccionDeBiomarcador,
  PlanDeCorreccionDeNota,
  TipoDeNota,
} from './ports.js';

/** Cambios que el cuerpo de la corrección de un biomarcador propone (ausente = no cambia). */
export interface CambiosDeBiomarcador {
  readonly value: string;
  readonly unit?: string | null | undefined;
  readonly referenceRange?: string | null | undefined;
  readonly performedAt?: string | undefined;
}

export interface CambiosDeNota {
  readonly content?: string | undefined;
  readonly noteType?: TipoDeNota | undefined;
}

/** Quién, cuándo y con qué ids se crean las filas de la corrección (reloj e ids inyectados, sin `Date.now()`). */
export interface ContextoDeCorreccion {
  readonly userId: string;
  readonly ahora: Date;
  readonly generarId: GeneradorDeIds;
  readonly patientId: string;
}

/** ¿La corrección cambia algún valor real del biomarcador? Una corrección idéntica no crea filas (D1). */
export function hayCambioRealDeBiomarcador(
  _actual: BiomarcadorActual,
  _cambios: CambiosDeBiomarcador,
): boolean {
  throw new Error('no implementado');
}

export function hayCambioRealDeNota(_actual: NotaActual, _cambios: CambiosDeNota): boolean {
  throw new Error('no implementado');
}

/** El examen de la corrección y si reemplaza al anterior (D3, `examenDeLaCorreccion()`). */
export function examenDeLaCorreccion(
  _actual: BiomarcadorActual,
  _nuevaFecha: string | undefined,
  _otrosVigentesEnElExamen: number,
  _contexto: ContextoDeCorreccion,
): ExamenDeCorreccionAGuardar {
  throw new Error('no implementado');
}

/** `planDeCorreccion()` del biomarcador (RN-08): qué filas se crean y cuál pasa a `reemplazado`. */
export function planDeCorreccionDeBiomarcador(
  _actual: BiomarcadorActual,
  _cambios: CambiosDeBiomarcador,
  _decision: DecisionDeNormalizacion,
  _otrosVigentesEnElExamen: number,
  _contexto: ContextoDeCorreccion,
): PlanDeCorreccionDeBiomarcador {
  throw new Error('no implementado');
}

/** `planDeCorreccion()` de la nota (RN-08). */
export function planDeCorreccionDeNota(
  _actual: NotaActual,
  _cambios: CambiosDeNota,
  _contexto: ContextoDeCorreccion,
): PlanDeCorreccionDeNota {
  throw new Error('no implementado');
}
