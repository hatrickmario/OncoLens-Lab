import type {
  Biomarker,
  Diagnosis,
  ManualEntryOptions,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import type { CatalogoDeDatosCriticos } from '../completeness/ports.js';
import { exigirPacienteQueAdmiteRegistros } from '../compartido/paciente-activo.js';
import type {
  CatalogoTerminologico,
  DecisionDeNormalizacion,
  ReconciliationService,
} from '../reconciliation/ports.js';
import {
  armarRegistroDeBiomarcador,
  comoBiomarcadorDelContrato,
} from './manual-entry.biomarcador.js';
import {
  armarDiagnosticoNuevo,
  comoDiagnosticoDelContrato,
  conCodigoDeLaDecision,
  datosDelPrimerDiagnostico,
  exigirCamposMinimosDelPrimerDiagnostico,
  exigirGradacionCoherente,
  gradacionDelCuerpo,
  gradacionesDelDiagnosticoNuevo,
} from './manual-entry.diagnostico.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import {
  fusionarCorreccion,
  opcionesDeRegistroManual,
  validarValoresDeCatalogo,
} from './manual-entry.reglas.js';
import type { CuerpoDeBiomarcador, CuerpoDeDiagnostico } from './manual-entry.schema.js';
import type {
  CatalogoDeEscalas,
  DatosDelDiagnostico,
  DiagnosticoVigente,
  RepositorioDeRegistroManual,
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
  /** Valores del catálogo para los formularios, según el diagnóstico vigente del paciente (RN-29). */
  opciones(patientId: string): Promise<ManualEntryOptions>;
}

export interface DependenciasDelService {
  readonly repositorio: RepositorioDeRegistroManual;
  readonly reconciliacion: ReconciliationService;
  readonly escalas: CatalogoDeEscalas;
  readonly terminologia: CatalogoTerminologico;
  readonly datosCriticos: CatalogoDeDatosCriticos;
  /** Tipos de cáncer del `manifest.json`. */
  readonly tiposDelCatalogo: readonly string[];
  readonly tiposHabilitados: TiposDeCancerHabilitados;
  readonly reloj: Clock;
  readonly generarId: GeneradorDeIds;
}

/** La decisión de normalización del tipo de cáncer: la toma `ReconciliationService` (RN-27), nunca este módulo. */
function decidirTipoDeCancer(
  reconciliacion: ReconciliationService,
  tipoDeCancer: string,
): DecisionDeNormalizacion {
  return reconciliacion.decidir({
    entidad: 'Diagnosis',
    tipoDeCancer,
    textoOriginal: tipoDeCancer,
  });
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
    : conCodigoDeLaDecision(fusionados, decidirTipoDeCancer(reconciliacion, fusionados.cancerType));
}

/** Sin vigente: exige los campos mínimos y toma el CIE-10 de la decisión sobre el tipo enviado. */
function primerDiagnostico(
  reconciliacion: ReconciliationService,
  cuerpo: CuerpoDeDiagnostico,
): DatosDelDiagnostico {
  exigirCamposMinimosDelPrimerDiagnostico(cuerpo);
  return datosDelPrimerDiagnostico(
    cuerpo,
    decidirTipoDeCancer(reconciliacion, cuerpo.cancerType ?? ''),
  );
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
        ? primerDiagnostico(reconciliacion, cuerpo)
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

/** `GET …/manual-entry-options`: lectura sin bloqueo; el tipo de cáncer lo fija el diagnóstico vigente (RN-29). */
async function opciones(
  dependencias: DependenciasDelService,
  patientId: string,
): Promise<ManualEntryOptions> {
  const contexto = await dependencias.repositorio.tipoDeCancerVigente(patientId);
  if (contexto === undefined) throw new PacienteNoEncontradoError();
  return opcionesDeRegistroManual(dependencias, contexto.tipoDeCancer);
}

export function createManualEntryService(dependencias: DependenciasDelService): ManualEntryService {
  return {
    registrarBiomarcador: (solicitud) => registrarBiomarcador(dependencias, solicitud),
    registrarDiagnostico: (solicitud) => registrarDiagnostico(dependencias, solicitud),
    opciones: (patientId) => opciones(dependencias, patientId),
  };
}
