import type {
  Biomarker,
  Diagnosis,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import type { ReconciliationService } from '../reconciliation/ports.js';
import type { CuerpoDeBiomarcador, CuerpoDeDiagnostico } from './manual-entry.schema.js';
import type { CatalogoDeEscalas, RepositorioDeRegistroManual } from './ports.js';

export interface SolicitudDeRegistro<C> {
  readonly patientId: string;
  /** Usuario de la sesión: queda como `reviewed_by` (el dato manual nace verificado). */
  readonly userId: string;
  readonly cuerpo: C;
}

export interface ManualEntryService {
  registrarBiomarcador(solicitud: SolicitudDeRegistro<CuerpoDeBiomarcador>): Promise<Biomarker>;
  registrarDiagnostico(solicitud: SolicitudDeRegistro<CuerpoDeDiagnostico>): Promise<Diagnosis>;
}

export interface DependenciasDelService {
  readonly repositorio: RepositorioDeRegistroManual;
  readonly reconciliacion: ReconciliationService;
  readonly escalas: CatalogoDeEscalas;
  readonly tiposHabilitados: TiposDeCancerHabilitados;
  readonly reloj: Clock;
  readonly generarId: GeneradorDeIds;
}

export function createManualEntryService(dependencias: DependenciasDelService): ManualEntryService {
  void dependencias;
  return {
    registrarBiomarcador() {
      return Promise.reject(new Error('no implementado'));
    },
    registrarDiagnostico() {
      return Promise.reject(new Error('no implementado'));
    },
  };
}
