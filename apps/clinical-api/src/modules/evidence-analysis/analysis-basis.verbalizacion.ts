import type { ClinicalContext } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { NO_DISPONIBLE } from './clinical-context.builder.js';

/** Un dato del contexto desidentificado, con el tipo que dice qué lista de `ClinicalContext` lo trajo. */
export type DatoDelContexto =
  | { tipo: 'diagnostico'; dato: NonNullable<ClinicalContext['diagnosis']> }
  | { tipo: 'biomarcador'; dato: ClinicalContext['biomarkers'][number] }
  | { tipo: 'atributo'; dato: ClinicalContext['attributes'][number] }
  | { tipo: 'tratamiento'; dato: ClinicalContext['priorTreatments'][number] }
  | { tipo: 'evento'; dato: ClinicalContext['events'][number] };

/** Un campo ausente (vacío o "No disponible", RN-25) se escribe como ausente, nunca como texto vacío. */
const datoPresente = (valor: string): string => (valor === '' ? NO_DISPONIBLE : valor);

const estaAusente = (valor: string): boolean => valor === '' || valor === NO_DISPONIBLE;

/** Une las partes que el dato sí trae (el estadio y la línea de tratamiento son opcionales y se omiten si faltan). */
function unirLoPresente(partes: readonly string[], separador: string): string {
  return partes.filter((parte) => !estaAusente(parte)).join(separador);
}

/**
 * Etiqueta determinista de un dato del contexto desidentificado (ADR-34, FR-27 a). Solo usa campos ya enmascarados
 * del contexto; no escribe los meses relativos, el `dataRef` ni el texto libre de los eventos.
 */
export function verbalizarDatoDelContexto(entrada: DatoDelContexto): string {
  switch (entrada.tipo) {
    case 'diagnostico': {
      const { cancerType, stagingSystem, stageValue } = entrada.dato;
      const estadio = unirLoPresente([stagingSystem, stageValue], ' ');
      return [datoPresente(cancerType), estadio].filter((parte) => parte !== '').join(' · ');
    }
    case 'biomarcador': {
      const { biomarkerName, value } = entrada.dato;
      return estaAusente(value)
        ? `${datoPresente(biomarkerName)}: ${NO_DISPONIBLE}`
        : `${datoPresente(biomarkerName)} ${value}`;
    }
    case 'atributo':
      return `${datoPresente(entrada.dato.key)}: ${estaAusente(entrada.dato.value) ? NO_DISPONIBLE : entrada.dato.value}`;
    case 'tratamiento': {
      const { regimenName, lineNumber } = entrada.dato;
      const linea = lineNumber === null ? '' : `línea ${lineNumber}`;
      return [datoPresente(regimenName), linea].filter((parte) => parte !== '').join(' · ');
    }
    case 'evento':
      return datoPresente(entrada.dato.eventType);
  }
}
