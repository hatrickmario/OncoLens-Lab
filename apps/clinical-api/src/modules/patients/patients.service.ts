import type {
  PatientAdminSummary,
  PatientListItem,
  PatientPage,
  PatientSummary,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { CompletenessService } from '../completeness/ports.js';
import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import type { IdentidadParcial, IdentityService } from './identity.service.js';
import type {
  BusquedaDePacientes,
  CriterioDeBusqueda,
  FiltrosDelListado,
} from './patients.schema.js';
import { obtenerFicha } from './ficha.service.js';
import type { FichaRepository } from './ficha.repository.js';
import type { VistaPorPermiso } from './vistas.js';
import {
  cancerTypeHabilitado,
  exigirIdentidad,
  comoResumenAdmin,
  enmascararDocumento,
  enmascararNombre,
  FALTANTES_CRITICOS_POR_AHORA,
} from './patients.reglas.js';
import type {
  FilaDePaciente,
  FiltroDePacientes,
  PatientsRepository,
} from './patients.repository.js';

export interface PatientsService {
  listar(entrada: { filtros: FiltrosDelListado; vista: VistaPorPermiso }): Promise<PatientPage>;
  buscar(entrada: { busqueda: BusquedaDePacientes; vista: VistaPorPermiso }): Promise<PatientPage>;
  /** Ficha de un paciente: `PatientSummary` para quien lee datos clínicos, `PatientAdminSummary` para el resto. */
  obtenerFicha(entrada: {
    patientId: string;
    vista: VistaPorPermiso;
  }): Promise<PatientSummary | PatientAdminSummary>;
}

export interface DependenciasDelService {
  repo: PatientsRepository;
  ficha: FichaRepository;
  identidad: IdentityService;
  tiposHabilitados: TiposDeCancerHabilitados;
  /** Solo para la ficha: el listado y la búsqueda no lo invocan (Q2, D7b). */
  completitud: CompletenessService;
  /** `PATIENTS_PAGE_SIZE` (RN-22). */
  pageSize: number;
}

type Elemento = PatientListItem | PatientAdminSummary;

/** Lo que una vista necesita además de la fila para armar su elemento. */
interface ContextoDeElemento {
  readonly tiposHabilitados: TiposDeCancerHabilitados;
  readonly pendientes: Map<string, number>;
}

function elementoDoctor(
  fila: FilaDePaciente,
  identificacion: IdentidadParcial,
  contexto: ContextoDeElemento,
): PatientListItem {
  return {
    view: 'doctor_listado',
    id: fila.id,
    idType: identificacion.idType,
    nationalIdMasked: enmascararDocumento(identificacion.numeroDeDocumento),
    fullNameMasked: enmascararNombre(nombreObligatorio(identificacion)),
    dataOrigin: fila.dataOrigin,
    lifecycleStatus: fila.lifecycleStatus,
    birthYear: fila.birthYear,
    cancerTypeEnabled: cancerTypeHabilitado(fila.cancerType, contexto.tiposHabilitados),
    pendingReviewCount: contexto.pendientes.get(fila.id) ?? 0,
    missingCriticalCount: FALTANTES_CRITICOS_POR_AHORA,
  };
}

/** La vista del doctor siempre pide el nombre: que falte es una violación de integridad, no un dato opcional. */
function nombreObligatorio(identificacion: IdentidadParcial): string {
  return exigirIdentidad(identificacion.nombreCompleto);
}

/**
 * Las dos vistas en un solo lugar: si cada una lee datos clínicos (el admin no, mínimo privilegio) y cómo arma su
 * elemento. Una tercera vista se añade aquí y el compilador exige el resto.
 */
const VISTAS: Record<
  VistaPorPermiso,
  {
    readonly conDatosClinicos: boolean;
    elemento(
      fila: FilaDePaciente,
      identificacion: IdentidadParcial,
      contexto: ContextoDeElemento,
    ): Elemento;
  }
> = {
  doctor_listado: { conDatosClinicos: true, elemento: elementoDoctor },
  admin: {
    conDatosClinicos: false,
    elemento: (fila, identificacion) => comoResumenAdmin(fila, identificacion),
  },
};

/** Descifra solo la identidad de las filas de la página (el nombre solo si la vista lo usa) y la entrega por paciente. */
async function identidadesDe(
  identidad: IdentityService,
  filas: FilaDePaciente[],
  conNombre: boolean,
): Promise<Map<string, IdentidadParcial>> {
  if (filas.length === 0) return new Map();
  const descifradas = await identidad.descifrarVarios(
    filas.map((fila) => fila.id),
    { conNombre },
  );
  return new Map(descifradas.map((fila) => [fila.patientId, fila]));
}

/** Una página de pacientes (con los filtros o solo los `ids` de una búsqueda) en la vista del permiso. */
async function paginar(
  dependencias: DependenciasDelService,
  entrada: {
    filtro: Omit<FiltroDePacientes, 'limit' | 'offset' | 'conDatosClinicos'>;
    page: number;
    vista: VistaPorPermiso;
  },
): Promise<PatientPage> {
  const { repo, identidad, tiposHabilitados, pageSize } = dependencias;
  const { filtro, page, vista } = entrada;
  const presentador = VISTAS[vista];
  const { filas, total } = await repo.listar({
    ...filtro,
    conDatosClinicos: presentador.conDatosClinicos,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const identidades = await identidadesDe(identidad, filas, presentador.conDatosClinicos);
  const pendientes = presentador.conDatosClinicos
    ? await repo.contarPendientesDeRevision(filas.map((fila) => fila.id))
    : new Map<string, number>();
  const items = filas.map((fila) =>
    presentador.elemento(fila, exigirIdentidad(identidades.get(fila.id)), {
      tiposHabilitados,
      pendientes,
    }),
  );
  return { items, page, pageSize, total };
}

/** Pacientes que coinciden con el criterio, por índice ciego: la identidad no se descifra para comparar (RN-10). */
function pacientesQueCoinciden(
  identidad: IdentityService,
  criterio: CriterioDeBusqueda,
): Promise<string[]> {
  return criterio.tipo === 'documento'
    ? identidad.buscarPorDocumento(criterio.idType, criterio.nationalId)
    : identidad.buscarPorNombre(criterio.name);
}

export function crearPatientsService(dependencias: DependenciasDelService): PatientsService {
  return {
    // El `status` del query se queda en el borde: aquí es el ciclo de vida del paciente.
    listar: ({ filtros, vista }) =>
      paginar(dependencias, {
        filtro: { lifecycleStatus: filtros.status, dataOrigin: filtros.dataOrigin },
        page: filtros.page,
        vista,
      }),
    obtenerFicha: (entrada) => obtenerFicha(dependencias, entrada),
    async buscar({ busqueda, vista }) {
      const ids = await pacientesQueCoinciden(dependencias.identidad, busqueda.criterio);
      return paginar(dependencias, { filtro: { ids }, page: busqueda.page, vista });
    },
  };
}
