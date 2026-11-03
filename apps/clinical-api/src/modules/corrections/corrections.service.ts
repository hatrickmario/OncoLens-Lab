import type {
  Biomarker,
  ClinicalNote,
  ClinicalNoteList,
  CorrectionHistory,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { ReconciliationService } from '../reconciliation/ports.js';
import type {
  CuerpoDeCorreccionDeBiomarcador,
  CuerpoDeCorreccionDeNota,
} from './corrections.schema.js';
import type { RepositorioDeCorrecciones } from './ports.js';

export interface SolicitudDeCorreccion<C> {
  readonly patientId: string;
  /** Usuario de la sesión: queda como `reviewed_by` / `created_by` (la corrección nace verificada). */
  readonly userId: string;
  /** Identificador de la fila vigente que se corrige (biomarcador o nota). */
  readonly datoId: string;
  readonly cuerpo: C;
}

export interface SolicitudDeLectura {
  readonly patientId: string;
  readonly datoId: string;
}

export interface CorrectionsService {
  corregirBiomarcador(
    solicitud: SolicitudDeCorreccion<CuerpoDeCorreccionDeBiomarcador>,
  ): Promise<Biomarker>;
  corregirNota(solicitud: SolicitudDeCorreccion<CuerpoDeCorreccionDeNota>): Promise<ClinicalNote>;
  historialDeBiomarcador(solicitud: SolicitudDeLectura): Promise<CorrectionHistory>;
  historialDeNota(solicitud: SolicitudDeLectura): Promise<CorrectionHistory>;
  notasVigentes(patientId: string): Promise<ClinicalNoteList>;
}

/** Límites de configuración (RN-22): nunca literales del dominio. */
export interface LimitesDeCorreccion {
  /** `CLINICAL_NOTE_MAX_CHARS`. */
  readonly notaMaxChars: number;
  /** `CORRECTION_HISTORY_MAX`. */
  readonly historialMax: number;
}

export interface DependenciasDelService {
  readonly repositorio: RepositorioDeCorrecciones;
  readonly reconciliacion: ReconciliationService;
  readonly limites: LimitesDeCorreccion;
  readonly reloj: Clock;
  readonly generarId: GeneradorDeIds;
}

export function createCorrectionsService(
  _dependencias: DependenciasDelService,
): CorrectionsService {
  throw new Error('no implementado');
}
