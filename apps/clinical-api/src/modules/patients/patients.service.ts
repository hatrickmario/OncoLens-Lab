import type {
  PatientAdminSummary,
  PatientListItem,
  PatientPage,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { IdentityIntegrityError } from '../../infrastructure/crypto/identity-integrity-error.js';
import type { TiposDeCancerHabilitados } from '../evidence-analysis/ports.js';
import type { IdentidadDescifrada, IdentityService } from './identity.service.js';
import type { FiltrosDelListado } from './patients.schema.js';
import { enmascararDocumento, enmascararNombre } from './patients.reglas.js';
import type { FilaDePaciente, PatientsRepository } from './patients.repository.js';

/** Vista de cada elemento según el permiso de la sesión (`x-view-by-permission`). */
export type VistaDeListado = 'doctor_listado' | 'admin';

export interface PatientsService {
  listar(entrada: { filtros: FiltrosDelListado; vista: VistaDeListado }): Promise<PatientPage>;
}

export interface DependenciasDelService {
  repo: PatientsRepository;
  identidad: IdentityService;
  tiposHabilitados: TiposDeCancerHabilitados;
  /** `PATIENTS_PAGE_SIZE` (RN-22). */
  pageSize: number;
}

/**
 * Hasta que existan los módulos de datos críticos (S3/S4) no hay faltantes que contar: el contador es 0 y no un
 * valor inventado (design D3).
 */
const FALTANTES_CRITICOS_POR_AHORA = 0;

export function crearPatientsService(dependencias: DependenciasDelService): PatientsService {
  const { repo, identidad, tiposHabilitados, pageSize } = dependencias;

  function elementoDoctor(
    fila: FilaDePaciente,
    identificacion: IdentidadDescifrada,
    pendientes: number,
  ): PatientListItem {
    return {
      view: 'doctor_listado',
      id: fila.id,
      idType: identificacion.idType,
      nationalIdMasked: enmascararDocumento(identificacion.numeroDeDocumento),
      fullNameMasked: enmascararNombre(identificacion.nombreCompleto),
      dataOrigin: fila.dataOrigin,
      lifecycleStatus: fila.lifecycleStatus,
      birthYear: fila.birthYear,
      cancerTypeEnabled:
        fila.cancerType !== null && tiposHabilitados.estaHabilitado(fila.cancerType),
      pendingReviewCount: pendientes,
      missingCriticalCount: FALTANTES_CRITICOS_POR_AHORA,
    };
  }

  function elementoAdmin(
    fila: FilaDePaciente,
    identificacion: IdentidadDescifrada,
  ): PatientAdminSummary {
    return {
      view: 'admin',
      id: fila.id,
      idType: identificacion.idType,
      nationalIdMasked: enmascararDocumento(identificacion.numeroDeDocumento),
      dataOrigin: fila.dataOrigin,
      lifecycleStatus: fila.lifecycleStatus,
      registeredAt: fila.registeredAt.toISOString(),
    };
  }

  /** Descifra solo la identidad de las filas de la página; un paciente sin identidad es una violación de integridad. */
  async function identidadesDe(filas: FilaDePaciente[]): Promise<Map<string, IdentidadDescifrada>> {
    const descifradas = await identidad.descifrarVarios(filas.map((fila) => fila.id));
    const porPaciente = new Map(descifradas.map((fila) => [fila.patientId, fila]));
    if (filas.some((fila) => !porPaciente.has(fila.id))) throw new IdentityIntegrityError();
    return porPaciente;
  }

  return {
    async listar({ filtros, vista }) {
      const { status, dataOrigin, page } = filtros;
      const { filas, total } = await repo.listar({
        status,
        dataOrigin,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      const identidades = await identidadesDe(filas);
      const pendientes =
        vista === 'doctor_listado'
          ? await repo.contarPendientesDeRevision(filas.map((fila) => fila.id))
          : new Map<string, number>();
      const items = filas.map((fila) => {
        const identificacion = identidades.get(fila.id) as IdentidadDescifrada;
        return vista === 'doctor_listado'
          ? elementoDoctor(fila, identificacion, pendientes.get(fila.id) ?? 0)
          : elementoAdmin(fila, identificacion);
      });
      return { items, page, pageSize, total };
    },
  };
}
