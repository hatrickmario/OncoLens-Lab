import type {
  Biomarker,
  ClinicalNote,
  ClinicalNoteList,
  CorrectionHistory,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import { exigirPacienteQueAdmiteRegistros } from '../compartido/paciente-activo.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import type { ReconciliationService } from '../reconciliation/ports.js';
import {
  comoBiomarcadorCorregido,
  comoHistorialDelContrato,
  comoNotaCorregida,
  comoNotaDelContrato,
} from './corrections.contrato.js';
import {
  CorreccionInvalidaError,
  DatoNoEncontradoError,
  DatoNoVigenteError,
} from './corrections.errores.js';
import {
  exigirDatoVigente,
  exigirFechaNoFutura,
  exigirTextoDeNotaValido,
  exigirValorDelFormatoDelResultado,
  fechaDeHoy,
  hayCambioRealDeBiomarcador,
  hayCambioRealDeNota,
  planDeCorreccionDeBiomarcador,
  planDeCorreccionDeNota,
  type ContextoDeCorreccion,
} from './corrections.reglas.js';
import type {
  CuerpoDeCorreccionDeBiomarcador,
  CuerpoDeCorreccionDeNota,
} from './corrections.schema.js';
import type { RepositorioDeCorrecciones, VersionReemplazada } from './ports.js';

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

function contextoDe(
  dependencias: DependenciasDelService,
  solicitud: { readonly patientId: string; readonly userId: string },
): ContextoDeCorreccion {
  return {
    patientId: solicitud.patientId,
    userId: solicitud.userId,
    ahora: dependencias.reloj.now(),
    generarId: dependencias.generarId,
  };
}

async function corregirBiomarcador(
  dependencias: DependenciasDelService,
  solicitud: SolicitudDeCorreccion<CuerpoDeCorreccionDeBiomarcador>,
): Promise<Biomarker> {
  const { repositorio, reconciliacion } = dependencias;
  const { patientId, datoId, cuerpo } = solicitud;
  return repositorio.enTransaccion(async (tx) => {
    await exigirPacienteQueAdmiteRegistros(tx, patientId);
    const actual = await tx.biomarcador(patientId, datoId);
    if (actual === null) throw new DatoNoEncontradoError();
    exigirDatoVigente(actual.reviewStatus);
    const contexto = contextoDe(dependencias, solicitud);
    exigirFechaNoFutura(cuerpo.performedAt, fechaDeHoy(contexto.ahora));
    exigirValorDelFormatoDelResultado(actual.resultType, cuerpo.value);
    if (!hayCambioRealDeBiomarcador(actual, cuerpo)) throw new CorreccionInvalidaError();
    // RN-27: la normalización final es de `ReconciliationService`; el texto original del dato no cambia (D4).
    const decision = reconciliacion.decidir({
      entidad: 'Biomarker',
      tipoDeCancer: await tx.tipoDeCancerVigente(patientId),
      textoOriginal: actual.originalName,
    });
    const otros = await tx.contarOtrosBiomarcadoresVigentes(actual.examId, actual.id);
    const plan = planDeCorreccionDeBiomarcador(actual, cuerpo, decision, otros, contexto);
    if (!(await tx.guardarCorreccionDeBiomarcador(plan))) throw new DatoNoVigenteError();
    return comoBiomarcadorCorregido(plan);
  });
}

async function corregirNota(
  dependencias: DependenciasDelService,
  solicitud: SolicitudDeCorreccion<CuerpoDeCorreccionDeNota>,
): Promise<ClinicalNote> {
  const { patientId, datoId, cuerpo } = solicitud;
  return dependencias.repositorio.enTransaccion(async (tx) => {
    await exigirPacienteQueAdmiteRegistros(tx, patientId);
    const actual = await tx.nota(patientId, datoId);
    if (actual === null) throw new DatoNoEncontradoError();
    exigirDatoVigente(actual.reviewStatus);
    exigirTextoDeNotaValido(cuerpo.content, dependencias.limites.notaMaxChars);
    if (!hayCambioRealDeNota(actual, cuerpo)) throw new CorreccionInvalidaError();
    const plan = planDeCorreccionDeNota(actual, cuerpo, contextoDe(dependencias, solicitud));
    if (!(await tx.guardarCorreccionDeNota(plan))) throw new DatoNoVigenteError();
    return comoNotaCorregida(plan.nota);
  });
}

/** El histórico de un dato (404 si no existe o es de otro paciente) con el tope de configuración. */
async function leerHistorial(
  leer: (limite: number) => Promise<readonly VersionReemplazada[] | null>,
  limites: LimitesDeCorreccion,
): Promise<CorrectionHistory> {
  const versiones = await leer(limites.historialMax);
  if (versiones === null) throw new DatoNoEncontradoError();
  return comoHistorialDelContrato(versiones);
}

async function notasVigentes(
  dependencias: DependenciasDelService,
  patientId: string,
): Promise<ClinicalNoteList> {
  const notas = await dependencias.repositorio.notasVigentes(patientId);
  if (notas === null) throw new PacienteNoEncontradoError();
  return { items: notas.map(comoNotaDelContrato) };
}

export function createCorrectionsService(dependencias: DependenciasDelService): CorrectionsService {
  const { repositorio, limites } = dependencias;
  return {
    corregirBiomarcador: (solicitud) => corregirBiomarcador(dependencias, solicitud),
    corregirNota: (solicitud) => corregirNota(dependencias, solicitud),
    historialDeBiomarcador: ({ patientId, datoId }) =>
      leerHistorial((tope) => repositorio.historialDeBiomarcador(patientId, datoId, tope), limites),
    historialDeNota: ({ patientId, datoId }) =>
      leerHistorial((tope) => repositorio.historialDeNota(patientId, datoId, tope), limites),
    notasVigentes: (patientId) => notasVigentes(dependencias, patientId),
  };
}
