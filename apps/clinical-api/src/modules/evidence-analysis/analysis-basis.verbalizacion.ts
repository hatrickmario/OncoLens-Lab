import type { ClinicalContext } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { NO_DISPONIBLE } from './clinical-context.builder.js';

/** Un dato del contexto desidentificado, con el tipo que dice qué lista de `ClinicalContext` lo trajo. */
export type DatoDelContexto =
  | { tipo: 'diagnostico'; dato: NonNullable<ClinicalContext['diagnosis']> }
  | { tipo: 'biomarcador'; dato: ClinicalContext['biomarkers'][number] }
  | { tipo: 'atributo'; dato: ClinicalContext['attributes'][number] }
  | { tipo: 'tratamiento'; dato: ClinicalContext['priorTreatments'][number] }
  | { tipo: 'evento'; dato: ClinicalContext['events'][number] };

/** Une las partes que el dato sí trae: un campo ausente (vacío o "No disponible") no se escribe en la etiqueta. */
function unirLoPresente(partes: readonly string[], separador: string): string {
  return partes.filter((parte) => parte !== '' && parte !== NO_DISPONIBLE).join(separador);
}

/**
 * Etiqueta determinista de un dato del contexto desidentificado (ADR-34, FR-27 a). Solo usa campos ya enmascarados
 * del contexto; no escribe los meses relativos, el `dataRef` ni el texto libre de los eventos.
 */
export function verbalizarDatoDelContexto(entrada: DatoDelContexto): string {
  switch (entrada.tipo) {
    case 'diagnostico': {
      const { cancerType, stagingSystem, stageValue } = entrada.dato;
      return unirLoPresente([cancerType, unirLoPresente([stagingSystem, stageValue], ' ')], ' · ');
    }
    case 'biomarcador':
      return unirLoPresente([entrada.dato.biomarkerName, entrada.dato.value], ' ');
    case 'atributo':
      return `${entrada.dato.key}: ${entrada.dato.value}`;
    case 'tratamiento': {
      const { regimenName, lineNumber } = entrada.dato;
      return unirLoPresente([regimenName, lineNumber === null ? '' : `línea ${lineNumber}`], ' · ');
    }
    case 'evento':
      return entrada.dato.eventType;
  }
}
