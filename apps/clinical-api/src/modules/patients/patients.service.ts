import type {
  PatientAdminSummary,
  PatientListItem,
  PatientPage,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { IdentityIntegrityError } from '../../infrastructure/crypto/identity-integrity-error.js';
import type { TiposDeCancerHabilitados } from '../evidence-analysis/ports.js';
import type { IdentidadDescifrada, IdentityService } from './identity.service.js';
import type {
  BusquedaDePacientes,
  CriterioDeBusqueda,
  FiltrosDelListado,
} from './patients.schema.js';
import { enmascararDocumento, enmascararNombre } from './patients.reglas.js';
import type {
  FilaDePaciente,
  FiltroDePacientes,
  PatientsRepository,
} from './patients.repository.js';

/** Vista de cada elemento según el permiso de la sesión (`x-view-by-permission`). */
export type VistaDeListado = 'doctor_listado' | 'admin';

export interface PatientsService {
  listar(entrada: { filtros: FiltrosDelListado; vista: VistaDeListado }): Promise<PatientPage>;
  buscar(entrada: { busqueda: BusquedaDePacientes; vista: VistaDeListado }): Promise<PatientPage>;
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

  /** Descifra solo la identidad de las filas de la página y la entrega por paciente. */
  async function identidadesDe(filas: FilaDePaciente[]): Promise<Map<string, IdentidadDescifrada>> {
    if (filas.length === 0) return new Map();
    const descifradas = await identidad.descifrarVarios(filas.map((fila) => fila.id));
    return new Map(descifradas.map((fila) => [fila.patientId, fila]));
  }

  /** Un paciente sin identidad guardada es una violación de integridad (L1D-200), no un dato opcional. */
  function identidadObligatoria(
    identidades: Map<string, IdentidadDescifrada>,
    patientId: string,
  ): IdentidadDescifrada {
    const encontrada = identidades.get(patientId);
    if (encontrada === undefined) throw new IdentityIntegrityError();
    return encontrada;
  }

  /** Los contadores clínicos solo se calculan para quien los ve (el admin no lee datos clínicos). */
  async function pendientesDe(filas: FilaDePaciente[], vista: VistaDeListado) {
    return vista === 'doctor_listado'
      ? repo.contarPendientesDeRevision(filas.map((fila) => fila.id))
      : new Map<string, number>();
  }

  /** Una página de pacientes (con los filtros o solo los `ids` de una búsqueda) en la vista del permiso. */
  async function paginar(
    filtro: Omit<FiltroDePacientes, 'limit' | 'offset' | 'conDatosClinicos'>,
    page: number,
    vista: VistaDeListado,
  ): Promise<PatientPage> {
    const { filas, total } = await repo.listar({
      ...filtro,
      conDatosClinicos: vista === 'doctor_listado',
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const identidades = await identidadesDe(filas);
    const pendientes = await pendientesDe(filas, vista);
    const items = filas.map((fila) => {
      const identificacion = identidadObligatoria(identidades, fila.id);
      return vista === 'doctor_listado'
        ? elementoDoctor(fila, identificacion, pendientes.get(fila.id) ?? 0)
        : elementoAdmin(fila, identificacion);
    });
    return { items, page, pageSize, total };
  }

  /** Pacientes que coinciden con el criterio, por índice ciego: la identidad no se descifra para comparar (RN-10). */
  async function pacientesQueCoinciden(criterio: CriterioDeBusqueda): Promise<string[]> {
    if (criterio.tipo === 'documento') {
      return identidad.buscarPorDocumento(criterio.idType, criterio.nationalId);
    }
    return identidad.buscarPorNombre(criterio.name);
  }

  return {
    listar: ({ filtros, vista }) =>
      paginar({ status: filtros.status, dataOrigin: filtros.dataOrigin }, filtros.page, vista),
    async buscar({ busqueda, vista }) {
      const ids = await pacientesQueCoinciden(busqueda.criterio);
      return paginar({ ids }, busqueda.page, vista);
    },
  };
}
