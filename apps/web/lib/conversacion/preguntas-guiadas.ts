import type {
  Biomarker,
  Diagnosis,
} from '../../../../packages/api-contracts/src/types/clinical-api';

/** Lo único de `PatientSummary` que consulta la función: nunca `identification` ni texto libre. */
export interface ResumenParaPreguntas {
  diagnosis: Pick<Diagnosis, 'cancerType' | 'stagingSystem' | 'stageValue' | 'grade'> | null;
  recentBiomarkers: ReadonlyArray<Pick<Biomarker, 'name' | 'value'>>;
}

export interface VarianteDePlantilla {
  texto: string;
  ranuras: readonly string[];
}

/** `plantillas.json` de un tipo: cada ítem ofrece la primera de sus variantes cuyas ranuras se resuelven. */
export interface PlantillasDeTipo {
  items: ReadonlyArray<{ id: string; variantes: readonly VarianteDePlantilla[] }>;
}

export interface CatalogosDeLasPreguntas {
  plantillas: Readonly<Record<string, PlantillasDeTipo>>;
  codigos: Readonly<Record<string, { entradas: ReadonlyArray<Record<string, unknown>> }>>;
  escalas: Record<string, unknown>;
  datosCriticos: Readonly<Record<string, { items: ReadonlyArray<Record<string, unknown>> }>>;
}

export function armarPreguntasGuiadas(
  _resumen: ResumenParaPreguntas,
  _catalogos: CatalogosDeLasPreguntas,
): string[] {
  throw new Error('no implementado');
}
