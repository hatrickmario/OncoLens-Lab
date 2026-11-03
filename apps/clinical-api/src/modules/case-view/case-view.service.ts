import type { CaseView } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import type { ChecklistDelPaciente, CompletenessService } from '../completeness/ports.js';
import type {
  AtributoLeido,
  AtributoDelCaso,
  CaseViewService,
  ChecklistDelCaso,
  RepositorioDeLaVistaDeCaso,
  TratamientoPrevioDelCaso,
  TratamientoPrevioLeido,
} from './ports.js';
import {
  eventosClinicos,
  eventosDerivados,
  ordenarTimeline,
  procedenciaDelContrato,
  seriesDeBiomarcadores,
} from './timeline.reglas.js';

export interface DependenciasDelServicio {
  readonly repo: RepositorioDeLaVistaDeCaso;
  /** El único cálculo del checklist (FR-23): la vista no lo reimplementa. */
  readonly completitud: CompletenessService;
}

const comoTratamientoDelCaso = (t: TratamientoPrevioLeido): TratamientoPrevioDelCaso => ({
  lineNumber: t.lineNumber,
  setting: t.setting,
  regimenName: t.regimenName,
  atcCodes: [...t.atcCodes],
  startedAt: t.startedAt,
  endedAt: t.endedAt,
  ongoing: t.ongoing,
  endReason: t.endReason,
  provenance: procedenciaDelContrato(t.procedencia),
});

const comoAtributoDelCaso = (a: AtributoLeido): AtributoDelCaso => ({
  key: a.key,
  value: a.value,
  observedAt: a.observedAt,
  provenance: procedenciaDelContrato(a.procedencia),
});

/** Del checklist de `/completeness` a la forma reducida de `CaseView` (`key` pasa a `item`); sin diagnóstico habilitado, `[]`. */
function comoChecklistDelCaso(checklist: ChecklistDelPaciente): ChecklistDelCaso {
  return checklist.items.map(({ key, status }) => ({ item: key, status }));
}

/**
 * Vista de caso (US-088): lee del repositorio lo vigente, deriva el timeline con las reglas puras y copia el checklist
 * del `CompletenessService`. El `404` lo decide primero la existencia del paciente (D10): no depende del orden del
 * checklist. Un fallo del repositorio se propaga (500), nunca una vista parcial.
 */
export function createCaseViewService(dependencias: DependenciasDelServicio): CaseViewService {
  const { repo, completitud } = dependencias;
  return {
    async obtener(patientId): Promise<CaseView> {
      const [existe, datos] = await Promise.all([
        repo.existePaciente(patientId),
        repo.leerDatosDelCaso(patientId),
      ]);
      if (!existe) throw new PacienteNoEncontradoError();
      const checklist = await completitud.calcular(patientId);
      return {
        timeline: ordenarTimeline([...eventosDerivados(datos), ...eventosClinicos(datos.eventos)]),
        priorTreatments: datos.tratamientos.map(comoTratamientoDelCaso),
        attributes: datos.atributos.map(comoAtributoDelCaso),
        biomarkerSeries: seriesDeBiomarcadores(datos.biomarcadores),
        completeness: comoChecklistDelCaso(checklist),
        catalogVersion: checklist.catalogVersion,
      };
    },
  };
}
