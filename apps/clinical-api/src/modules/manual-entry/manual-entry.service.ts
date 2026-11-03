import type {
  Biomarker,
  Diagnosis,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import { pacienteAdmiteRegistros } from '../compartido/paciente-activo.js';
import { estadoPersistible, type ReconciliationService } from '../reconciliation/ports.js';
import { PacienteEgresadoError } from './manual-entry.errores.js';
import {
  armarRegistroDeBiomarcador,
  comoBiomarcadorDelContrato,
} from './manual-entry.biomarcador.js';
import {
  armarDiagnosticoNuevo,
  comoDiagnosticoDelContrato,
  datosDelPrimerDiagnostico,
  exigirGradacionCoherente,
  gradacionDelCuerpo,
  gradacionesDelDiagnosticoNuevo,
} from './manual-entry.diagnostico.js';
import { fusionarCorreccion, validarValoresDeCatalogo } from './manual-entry.reglas.js';
import type { CuerpoDeBiomarcador, CuerpoDeDiagnostico } from './manual-entry.schema.js';
import type {
  CatalogoDeEscalas,
  DatosDelDiagnostico,
  DiagnosticoVigente,
  RepositorioDeRegistroManual,
  TransaccionDeRegistro,
} from './ports.js';

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

/** Precondición común, ya con el paciente bloqueado: existe (404) y admite registros (RN-17, 422). */
async function exigirPacienteQueAdmiteRegistros(
  tx: TransaccionDeRegistro,
  patientId: string,
): Promise<void> {
  const paciente = await tx.bloquearPaciente(patientId);
  if (paciente === null) throw new PacienteNoEncontradoError();
  if (!pacienteAdmiteRegistros(paciente.estado)) throw new PacienteEgresadoError();
}

/** CIE-10 y `mapping_status` del tipo de cáncer: los decide `ReconciliationService` (RN-27), nunca este módulo. */
function conCodigoDelTipoDeCancer(
  reconciliacion: ReconciliationService,
  datos: DatosDelDiagnostico,
): DatosDelDiagnostico {
  const decision = reconciliacion.decidir({
    entidad: 'Diagnosis',
    tipoDeCancer: datos.cancerType,
    textoOriginal: datos.cancerType,
  });
  return {
    ...datos,
    icd10Code: decision.icd10Code,
    mappingStatus: estadoPersistible(decision),
  };
}

/** `corregirDiagnosticoVigente()` (RN-08): los valores del vigente más lo enviado; un tipo de cáncer nuevo recodifica. */
function corregirDiagnosticoVigente(
  reconciliacion: ReconciliationService,
  vigente: DiagnosticoVigente,
  cuerpo: CuerpoDeDiagnostico,
): DatosDelDiagnostico {
  const fusionados = fusionarCorreccion(vigente.datos, cuerpo);
  return fusionados.cancerType === vigente.datos.cancerType
    ? fusionados
    : conCodigoDelTipoDeCancer(reconciliacion, fusionados);
}

async function registrarBiomarcador(
  dependencias: DependenciasDelService,
  { patientId, userId, cuerpo }: SolicitudDeRegistro<CuerpoDeBiomarcador>,
): Promise<Biomarker> {
  const { repositorio, reconciliacion, reloj, generarId } = dependencias;
  return repositorio.enTransaccion(async (tx) => {
    await exigirPacienteQueAdmiteRegistros(tx, patientId);
    const vigente = await tx.diagnosticoVigente(patientId);
    // Sin diagnóstico vigente no hay tipo de cáncer (`null`): `ReconciliationService` decide `no_mapeado`.
    const decision = reconciliacion.decidir({
      entidad: 'Biomarker',
      tipoDeCancer: vigente?.datos.cancerType ?? null,
      textoOriginal: cuerpo.name,
    });
    const registro = armarRegistroDeBiomarcador({
      cuerpo,
      decision,
      patientId,
      userId,
      episodeId: await tx.episodioDelRegistro(patientId),
      ahora: reloj.now(),
      generarId,
    });
    await tx.guardarBiomarcador(registro.examen, registro.biomarcador);
    return comoBiomarcadorDelContrato(registro);
  });
}

async function registrarDiagnostico(
  dependencias: DependenciasDelService,
  { patientId, userId, cuerpo }: SolicitudDeRegistro<CuerpoDeDiagnostico>,
): Promise<Diagnosis> {
  const { repositorio, reconciliacion, escalas, tiposHabilitados, reloj, generarId } = dependencias;
  return repositorio.enTransaccion(async (tx) => {
    await exigirPacienteQueAdmiteRegistros(tx, patientId);
    const ahora = reloj.now();
    const vigente = await tx.diagnosticoVigente(patientId);
    const datos =
      vigente === null
        ? conCodigoDelTipoDeCancer(reconciliacion, datosDelPrimerDiagnostico(cuerpo))
        : corregirDiagnosticoVigente(reconciliacion, vigente, cuerpo);
    const id = generarId();
    const contexto = { generarId, diagnosisId: id, userId, ahora };
    const nueva =
      cuerpo.grading === undefined ? undefined : gradacionDelCuerpo(cuerpo.grading, contexto);
    const gradaciones = gradacionesDelDiagnosticoNuevo(vigente?.gradaciones ?? [], nueva, contexto);
    const sistemasDeGradacion = gradaciones.map((g) => g.gradingSystem);
    validarValoresDeCatalogo({ escalas, tiposHabilitados }, cuerpo, {
      ...datos,
      sistemasDeGradacion,
    });
    exigirGradacionCoherente(cuerpo.grading);
    const diagnostico = armarDiagnosticoNuevo({
      id,
      datos,
      gradaciones,
      patientId,
      userId,
      ahora,
      episodeId: await tx.episodioDelRegistro(patientId),
      esCorreccion: vigente !== null,
    });
    await tx.guardarDiagnostico(diagnostico, gradaciones, vigente?.id ?? null);
    return comoDiagnosticoDelContrato(diagnostico, gradaciones);
  });
}

export function createManualEntryService(dependencias: DependenciasDelService): ManualEntryService {
  return {
    registrarBiomarcador: (solicitud) => registrarBiomarcador(dependencias, solicitud),
    registrarDiagnostico: (solicitud) => registrarDiagnostico(dependencias, solicitud),
  };
}
