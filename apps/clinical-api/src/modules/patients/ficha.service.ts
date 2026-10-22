import type {
  Biomarker,
  Diagnosis,
  PatientAdminSummary,
  PatientSummary,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { IdentityIntegrityError } from '../../infrastructure/crypto/identity-integrity-error.js';
import type { TiposDeCancerHabilitados } from '../evidence-analysis/ports.js';
import { PacienteNoEncontradoError } from './patients.errores.js';
import type { FichaRepository, FilaDePacienteDeLaFicha } from './ficha.repository.js';
import {
  comoBiomarcador,
  comoDiagnostico,
  seleccionarDiagnosticoVigente,
  ultimoValorPorBiomarcador,
} from './ficha.reglas.js';
import type { IdentityService } from './identity.service.js';
import { enmascararDocumento } from './patients.reglas.js';
import type { PatientsRepository } from './patients.repository.js';
import type { VistaDeListado } from './vistas.js';

export interface DependenciasDeLaFicha {
  ficha: FichaRepository;
  /** Solo para `contarPendientesDeRevision`: el mismo catálogo de fuentes que usa el listado. */
  repo: PatientsRepository;
  identidad: IdentityService;
  tiposHabilitados: TiposDeCancerHabilitados;
}

/**
 * Hasta que existan los módulos de datos críticos (S3/S4) no hay faltantes que contar: el contador es 0 y no un
 * valor inventado (design D5 de L1D-72).
 */
const FALTANTES_CRITICOS_POR_AHORA = 0;

/** Un paciente sin identidad guardada es una violación de integridad (L1D-200), no un dato opcional. */
function identidadObligatoria<T>(identidades: readonly T[]): T {
  const identidad = identidades[0];
  if (identidad === undefined) throw new IdentityIntegrityError();
  return identidad;
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
  const { identidad, repo, tiposHabilitados } = dependencias;
  const descifrada = await identidad.descifrar(paciente.id);
  if (descifrada === null) throw new IdentityIntegrityError();
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
    cancerTypeEnabled:
      diagnostico !== null && tiposHabilitados.estaHabilitado(diagnostico.cancerType),
    diagnosis: diagnostico,
    recentBiomarkers: await biomarcadoresRecientes(dependencias, paciente.id),
    pendingReviewCount: pendientes.get(paciente.id) ?? 0,
    missingCriticalCount: FALTANTES_CRITICOS_POR_AHORA,
  };
}

/** Vista del admin (mínimo privilegio): ni nombre ni datos clínicos; del documento, solo su máscara. */
async function fichaDelAdmin(
  dependencias: DependenciasDeLaFicha,
  paciente: FilaDePacienteDeLaFicha,
): Promise<PatientAdminSummary> {
  const descifradas = await dependencias.identidad.descifrarVarios([paciente.id], {
    conNombre: false,
  });
  const identificacion = identidadObligatoria(descifradas);
  return {
    view: 'admin',
    id: paciente.id,
    idType: identificacion.idType,
    nationalIdMasked: enmascararDocumento(identificacion.numeroDeDocumento),
    dataOrigin: paciente.dataOrigin,
    lifecycleStatus: paciente.lifecycleStatus,
    registeredAt: paciente.registeredAt.toISOString(),
  };
}

/** Ficha del paciente en la vista del permiso; un paciente inexistente es `PacienteNoEncontradoError` (404). */
export async function obtenerFicha(
  dependencias: DependenciasDeLaFicha,
  entrada: { patientId: string; vista: VistaDeListado },
): Promise<PatientSummary | PatientAdminSummary> {
  const paciente = await dependencias.ficha.paciente(entrada.patientId);
  if (paciente === null) throw new PacienteNoEncontradoError();
  return entrada.vista === 'doctor_listado'
    ? fichaDelDoctor(dependencias, paciente)
    : fichaDelAdmin(dependencias, paciente);
}
