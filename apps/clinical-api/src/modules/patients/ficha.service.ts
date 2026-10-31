import type {
  Biomarker,
  Diagnosis,
  PatientAdminSummary,
  PatientSummary,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { faltantesDe } from '../completeness/completeness.rules.js';
import type { CompletenessService } from '../completeness/ports.js';
import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import type { FichaRepository, FilaDePacienteDeLaFicha } from './ficha.repository.js';
import {
  comoBiomarcador,
  comoDiagnostico,
  seleccionarDiagnosticoVigente,
  ultimoValorPorBiomarcador,
} from './ficha.reglas.js';
import type { IdentityService } from './identity.service.js';
import { cancerTypeHabilitado, comoResumenAdmin, exigirIdentidad } from './patients.reglas.js';
import type { PatientsRepository } from './patients.repository.js';
import type { VistaPorPermiso } from './vistas.js';

export interface DependenciasDeLaFicha {
  ficha: FichaRepository;
  /** Solo para `contarPendientesDeRevision`: el mismo catálogo de fuentes que usa el listado. */
  repo: Pick<PatientsRepository, 'contarPendientesDeRevision'>;
  identidad: IdentityService;
  tiposHabilitados: TiposDeCancerHabilitados;
  /** El mismo servicio del endpoint `/completeness` y del análisis (US-003, D2): una sola implementación. */
  completitud: CompletenessService;
}

async function diagnosticoVigente(
  dependencias: DependenciasDeLaFicha,
  patientId: string,
): Promise<Diagnosis | null> {
  const { ficha } = dependencias;
  const vigente = seleccionarDiagnosticoVigente(await ficha.diagnosticos(patientId));
  if (vigente === null) return null;
  const gradaciones = await ficha.gradaciones(vigente.id);
  const adicionales = await ficha.fuentesAdicionales('diagnosis', [vigente.id]);
  return comoDiagnostico(vigente, gradaciones, adicionales.get(vigente.id) ?? []);
}

/** Lo que la ficha muestra del checklist: el contador y, si el cálculo falló, la marca de que no está disponible. */
type FaltantesDeLaFicha = Pick<PatientSummary, 'missingCriticalCount' | 'completenessAvailable'>;

/**
 * Datos críticos faltantes del paciente (FR-23). Si el cálculo falla, la ficha NO falla (RN-26: un aviso clínico no
 * bloquea): `missingCriticalCount = 0` y `completenessAvailable = false`, sin propagar el error de la base (RN-10).
 */
async function faltantesCriticos(
  completitud: CompletenessService,
  patientId: string,
): Promise<FaltantesDeLaFicha> {
  try {
    return { missingCriticalCount: faltantesDe(await completitud.calcular(patientId)).length };
  } catch {
    return { missingCriticalCount: 0, completenessAvailable: false };
  }
}

async function biomarcadoresRecientes(
  dependencias: DependenciasDeLaFicha,
  patientId: string,
): Promise<Biomarker[]> {
  const { ficha } = dependencias;
  const ultimos = ultimoValorPorBiomarcador(await ficha.biomarcadores(patientId));
  const adicionales = await ficha.fuentesAdicionales(
    'biomarker',
    ultimos.map((fila) => fila.id),
  );
  return ultimos.map((fila) => comoBiomarcador(fila, adicionales.get(fila.id) ?? []));
}

/** Vista del doctor: la identidad se descifra solo para esta respuesta (RN-10). */
async function fichaDelDoctor(
  dependencias: DependenciasDeLaFicha,
  paciente: FilaDePacienteDeLaFicha,
): Promise<PatientSummary> {
  const { identidad, repo, tiposHabilitados, completitud } = dependencias;
  const descifrada = exigirIdentidad((await identidad.descifrar(paciente.id)) ?? undefined);
  const diagnostico = await diagnosticoVigente(dependencias, paciente.id);
  const pendientes = await repo.contarPendientesDeRevision([paciente.id]);
  return {
    view: 'doctor',
    id: paciente.id,
    identification: {
      idType: descifrada.idType,
      nationalId: descifrada.numeroDeDocumento,
      fullName: descifrada.nombreCompleto,
    },
    dataOrigin: paciente.dataOrigin,
    lifecycleStatus: paciente.lifecycleStatus,
    birthYear: paciente.birthYear,
    requiresRatification: paciente.requiresRatification,
    cancerTypeEnabled: cancerTypeHabilitado(diagnostico?.cancerType ?? null, tiposHabilitados),
    diagnosis: diagnostico,
    recentBiomarkers: await biomarcadoresRecientes(dependencias, paciente.id),
    pendingReviewCount: pendientes.get(paciente.id) ?? 0,
    ...(await faltantesCriticos(completitud, paciente.id)),
  };
}

/** Vista del admin: del documento descifra solo lo necesario para la máscara, nunca el nombre. */
async function fichaDelAdmin(
  dependencias: DependenciasDeLaFicha,
  paciente: FilaDePacienteDeLaFicha,
): Promise<PatientAdminSummary> {
  const descifradas = await dependencias.identidad.descifrarVarios([paciente.id], {
    conNombre: false,
  });
  return comoResumenAdmin(paciente, exigirIdentidad(descifradas[0]));
}

/** Ficha del paciente en la vista del permiso; un paciente inexistente es `PacienteNoEncontradoError` (404). */
export async function obtenerFicha(
  dependencias: DependenciasDeLaFicha,
  entrada: { patientId: string; vista: VistaPorPermiso },
): Promise<PatientSummary | PatientAdminSummary> {
  const paciente = await dependencias.ficha.paciente(entrada.patientId);
  if (paciente === null) throw new PacienteNoEncontradoError();
  return entrada.vista === 'doctor_listado'
    ? fichaDelDoctor(dependencias, paciente)
    : fichaDelAdmin(dependencias, paciente);
}
