import type { PriorTreatment } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import { exigirPacienteQueAdmiteRegistros } from '../compartido/paciente-activo.js';
import type { ReconciliationService } from '../reconciliation/ports.js';
import type { CuerpoDeTratamiento } from './prior-treatments.schema.js';
import {
  armarTratamientoManual,
  comoTratamientoDelContrato,
} from './prior-treatments.tratamiento.js';
import type { RepositorioDeTratamientos } from './ports.js';

export interface SolicitudDeTratamiento {
  readonly patientId: string;
  readonly cuerpo: CuerpoDeTratamiento;
}

export interface PriorTreatmentsService {
  registrarTratamiento(solicitud: SolicitudDeTratamiento): Promise<PriorTreatment>;
}

export interface DependenciasDelService {
  readonly repositorio: RepositorioDeTratamientos;
  readonly reconciliacion: ReconciliationService;
  readonly reloj: Clock;
  readonly generarId: GeneradorDeIds;
}

export function createPriorTreatmentsService(
  dependencias: DependenciasDelService,
): PriorTreatmentsService {
  const { repositorio, reconciliacion, reloj, generarId } = dependencias;
  return {
    registrarTratamiento: ({ patientId, cuerpo }) =>
      repositorio.enTransaccion(async (tx) => {
        await exigirPacienteQueAdmiteRegistros(tx, patientId);
        // Sin diagnóstico vigente no hay tipo de cáncer (`null`): `ReconciliationService` decide `no_mapeado` (RN-27).
        const decision = reconciliacion.decidir({
          entidad: 'PriorTreatment',
          tipoDeCancer: await tx.tipoDeCancerVigente(patientId),
          textoOriginal: cuerpo.regimenName,
        });
        const tratamiento = armarTratamientoManual({
          cuerpo,
          decision,
          patientId,
          episodeId: await tx.episodioDelRegistro(patientId),
          ahora: reloj.now(),
          generarId,
        });
        await tx.guardarTratamiento(tratamiento);
        return comoTratamientoDelContrato(tratamiento);
      }),
  };
}
