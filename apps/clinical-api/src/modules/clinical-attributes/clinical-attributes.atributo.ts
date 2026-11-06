import type {
  ClinicalAttribute,
  ClinicalAttributeList,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import { comoProvenance } from '../patients/ficha.reglas.js';
import { precisionDeFecha } from './clinical-attributes.reglas.js';
import type { CuerpoDeAtributo } from './clinical-attributes.schema.js';
import type { AtributoAGuardar, AtributoLeido, AtributoPermitido } from './ports.js';

export interface EntradaDelAtributo {
  readonly cuerpo: CuerpoDeAtributo;
  readonly patientId: string;
  readonly episodeId: string;
  readonly ahora: Date;
  readonly generarId: GeneradorDeIds;
}

/** La fila del atributo manual: clave y valor ya validados contra el catálogo, procedencia manual verificada. */
export function armarAtributoManual(entrada: EntradaDelAtributo): AtributoAGuardar {
  const { cuerpo } = entrada;
  return {
    id: entrada.generarId(),
    patientId: entrada.patientId,
    episodeId: entrada.episodeId,
    attributeKey: cuerpo.attributeKey,
    value: cuerpo.value,
    observedAt: cuerpo.observedAt ?? null,
    datePrecision: precisionDeFecha(cuerpo.observedAt),
    entryMethod: 'manual',
    extractionConfidence: 'n_a',
    reviewStatus: 'verificado',
    createdAt: entrada.ahora,
    supersedesId: null,
  };
}

/** El atributo recién guardado tal como se lee: manual, sin documento fuente. */
export function comoAtributoLeido(a: AtributoAGuardar): AtributoLeido {
  return {
    id: a.id,
    attributeKey: a.attributeKey,
    value: a.value,
    observedAt: a.observedAt,
    datePrecision: a.datePrecision,
    entryMethod: a.entryMethod,
    extractionConfidence: a.extractionConfidence,
    reviewStatus: a.reviewStatus,
    sourceDocumentId: null,
    supersedesId: a.supersedesId,
  };
}

/** `ClinicalAttribute` del contrato desde una fila leída (sin conflicto ni documentos adicionales). */
export function comoAtributoDelContrato(a: AtributoLeido): ClinicalAttribute {
  return {
    id: a.id,
    key: a.attributeKey,
    value: a.value,
    observedAt: a.observedAt,
    datePrecision: a.datePrecision,
    provenance: comoProvenance(
      {
        entryMethod: a.entryMethod,
        extractionConfidence: a.extractionConfidence,
        reviewStatus: a.reviewStatus,
        conflictsWithId: null,
        sourceDocumentId: a.sourceDocumentId,
      },
      [],
    ),
    // Opcional en el contrato: solo una corrección lo trae, así la UI sabe si hay histórico (ADR-50).
    ...(a.supersedesId !== null && { supersedesId: a.supersedesId }),
  };
}

export function comoListaDeAtributos(
  vigentes: readonly AtributoLeido[],
  permitidos: readonly AtributoPermitido[],
  catalogVersion: string,
): ClinicalAttributeList {
  return {
    items: vigentes.map(comoAtributoDelContrato),
    allowedAttributes: permitidos.map((p) => ({
      key: p.key,
      label: p.label,
      values: p.values.map((v) => ({ value: v.value, label: v.label })),
    })),
    catalogVersion,
  };
}
