import type {
  Biomarker,
  ClinicalAttribute,
  ClinicalNote,
  ClinicalNoteList,
  CorrectionHistory,
  PriorTreatment,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import {
  comoAtributoDelContrato,
  comoAtributoLeido,
} from '../clinical-attributes/clinical-attributes.atributo.js';
import { comoTratamientoDelContrato } from '../prior-treatments/prior-treatments.tratamiento.js';
import {
  esDeclaracionDeAusencia,
  exigirSinTratamientosParaDeclarar,
} from '../compartido/declaracion-de-ausencia.js';
import { exigirPacienteQueAdmiteRegistros } from '../compartido/paciente-activo.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import type { CatalogoDeAtributos } from '../clinical-attributes/ports.js';
import type { ReconciliationService } from '../reconciliation/ports.js';
import {
  comoBiomarcadorCorregido,
  comoHistorialDelContrato,
  comoNotaCorregida,
  comoNotaDelContrato,
} from './corrections.contrato.js';
import { DatoNoEncontradoError, DatoNoVigenteError } from './corrections.errores.js';
import {
  exigirCorreccionValidaDeAtributo,
  exigirCorreccionValidaDeBiomarcador,
  exigirCorreccionValidaDeNota,
  exigirCorreccionValidaDeTratamiento,
  exigirDatoVigente,
  exigirValorDelCatalogo,
  fechaDeHoy,
  planDeCorreccionDeAtributo,
  planDeCorreccionDeBiomarcador,
  planDeCorreccionDeNota,
  planDeCorreccionDeTratamiento,
  type ContextoDeCorreccion,
} from './corrections.reglas.js';
import type {
  CuerpoDeCorreccionDeAtributo,
  CuerpoDeCorreccionDeBiomarcador,
  CuerpoDeCorreccionDeNota,
  CuerpoDeCorreccionDeTratamiento,
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
  corregirTratamiento(
    solicitud: SolicitudDeCorreccion<CuerpoDeCorreccionDeTratamiento>,
  ): Promise<PriorTreatment>;
  corregirAtributo(
    solicitud: SolicitudDeCorreccion<CuerpoDeCorreccionDeAtributo>,
  ): Promise<ClinicalAttribute>;
  historialDeBiomarcador(solicitud: SolicitudDeLectura): Promise<CorrectionHistory>;
  historialDeNota(solicitud: SolicitudDeLectura): Promise<CorrectionHistory>;
  historialDeTratamiento(solicitud: SolicitudDeLectura): Promise<CorrectionHistory>;
  historialDeAtributo(solicitud: SolicitudDeLectura): Promise<CorrectionHistory>;
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
  /** `atributos.json` del catálogo montado (RN-29): el valor corregido se valida contra su lista. */
  readonly catalogoDeAtributos: CatalogoDeAtributos;
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
    exigirCorreccionValidaDeBiomarcador(actual, cuerpo, fechaDeHoy(contexto.ahora));
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
    exigirCorreccionValidaDeNota(actual, cuerpo, dependencias.limites.notaMaxChars);
    const plan = planDeCorreccionDeNota(actual, cuerpo, contextoDe(dependencias, solicitud));
    if (!(await tx.guardarCorreccionDeNota(plan))) throw new DatoNoVigenteError();
    return comoNotaCorregida(plan.nota);
  });
}

async function corregirTratamiento(
  dependencias: DependenciasDelService,
  solicitud: SolicitudDeCorreccion<CuerpoDeCorreccionDeTratamiento>,
): Promise<PriorTreatment> {
  const { repositorio, reconciliacion } = dependencias;
  const { patientId, datoId, cuerpo } = solicitud;
  return repositorio.enTransaccion(async (tx) => {
    await exigirPacienteQueAdmiteRegistros(tx, patientId);
    const actual = await tx.tratamiento(patientId, datoId);
    if (actual === null) throw new DatoNoEncontradoError();
    exigirDatoVigente(actual.reviewStatus);
    exigirCorreccionValidaDeTratamiento(actual, cuerpo);
    // RN-27 / ADR-33: la normalización final es de `ReconciliationService`; el cliente nunca envía códigos.
    const decision = reconciliacion.decidir({
      entidad: 'PriorTreatment',
      tipoDeCancer: await tx.tipoDeCancerVigente(patientId),
      textoOriginal: cuerpo.regimenName,
    });
    const plan = planDeCorreccionDeTratamiento(
      actual,
      cuerpo,
      decision,
      contextoDe(dependencias, solicitud),
    );
    if (!(await tx.guardarCorreccionDeTratamiento(plan))) throw new DatoNoVigenteError();
    return comoTratamientoDelContrato(plan.tratamiento);
  });
}

async function corregirAtributo(
  dependencias: DependenciasDelService,
  solicitud: SolicitudDeCorreccion<CuerpoDeCorreccionDeAtributo>,
): Promise<ClinicalAttribute> {
  const { repositorio, catalogoDeAtributos } = dependencias;
  const { patientId, datoId, cuerpo } = solicitud;
  return repositorio.enTransaccion(async (tx) => {
    await exigirPacienteQueAdmiteRegistros(tx, patientId);
    const actual = await tx.atributo(patientId, datoId);
    if (actual === null) throw new DatoNoEncontradoError();
    exigirDatoVigente(actual.reviewStatus);
    // D4 (d5fb-04): una declaración vigente no convive con un tratamiento vigente; si el dato lo contradice, no se toca.
    if (esDeclaracionDeAusencia(actual.attributeKey)) {
      await exigirSinTratamientosParaDeclarar(tx, patientId);
    }
    const tipoDeCancer = await tx.tipoDeCancerVigente(patientId);
    const permitidos =
      tipoDeCancer === null ? [] : catalogoDeAtributos.atributosPermitidos(tipoDeCancer);
    exigirValorDelCatalogo(permitidos, actual.attributeKey, cuerpo.value);
    exigirCorreccionValidaDeAtributo(actual, cuerpo);
    const plan = planDeCorreccionDeAtributo(actual, cuerpo, contextoDe(dependencias, solicitud));
    if (!(await tx.guardarCorreccionDeAtributo(plan))) throw new DatoNoVigenteError();
    return comoAtributoDelContrato(comoAtributoLeido(plan.atributo));
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
    corregirTratamiento: (solicitud) => corregirTratamiento(dependencias, solicitud),
    corregirAtributo: (solicitud) => corregirAtributo(dependencias, solicitud),
    historialDeBiomarcador: ({ patientId, datoId }) =>
      leerHistorial((tope) => repositorio.historialDeBiomarcador(patientId, datoId, tope), limites),
    historialDeNota: ({ patientId, datoId }) =>
      leerHistorial((tope) => repositorio.historialDeNota(patientId, datoId, tope), limites),
    historialDeTratamiento: ({ patientId, datoId }) =>
      leerHistorial((tope) => repositorio.historialDeTratamiento(patientId, datoId, tope), limites),
    historialDeAtributo: ({ patientId, datoId }) =>
      leerHistorial((tope) => repositorio.historialDeAtributo(patientId, datoId, tope), limites),
    notasVigentes: (patientId) => notasVigentes(dependencias, patientId),
  };
}
