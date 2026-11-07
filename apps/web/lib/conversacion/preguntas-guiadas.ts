import type {
  Biomarker,
  Diagnosis,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { normalizarTexto as normalizar } from '../../../../packages/clinical-language/src/normalizar';

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

type Entrada = Record<string, unknown>;

/** Lo que consulta de `packages/clinical-catalogs`: plantillas, códigos y datos críticos por tipo, y `escalas.json`. */
export interface CatalogosDeLasPreguntas {
  plantillas: Readonly<Record<string, PlantillasDeTipo>>;
  codigos: Readonly<Record<string, { entradas: readonly Entrada[] }>>;
  escalas: {
    sistemasDeEstadificacion: readonly Entrada[];
    sistemasDeGradacion: readonly Entrada[];
    valoresDeBiomarcador: readonly Entrada[];
  };
  datosCriticos: Readonly<Record<string, { items: readonly Entrada[] }>>;
}

/** Hasta 4 preguntas por conversación nueva (design D7). */
const MAXIMO_DE_PREGUNTAS = 4;

type Ranuras = Partial<Record<string, string>>;

const textoDe = (valor: unknown): string | undefined =>
  typeof valor === 'string' && valor.trim() !== '' ? valor : undefined;

const listaDe = (valor: unknown): readonly string[] =>
  Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];

const delTipo = (sistema: Entrada, tipo: string): boolean => listaDe(sistema.tiposDeCancer).includes(tipo);

function etiquetaDe(catalogos: CatalogosDeLasPreguntas, tipo: string, canonico: string): string | undefined {
  const entrada = catalogos.codigos[tipo]?.entradas.find(
    (e) => normalizar(String(e.terminoCanonico ?? '')) === normalizar(canonico),
  );
  return textoDe(entrada?.etiquetaEs);
}

function estadioDe(resumen: ResumenParaPreguntas, tipo: string, catalogos: CatalogosDeLasPreguntas) {
  const { stagingSystem, stageValue } = resumen.diagnosis ?? {};
  const sistema = catalogos.escalas.sistemasDeEstadificacion.find(
    (s) => delTipo(s, tipo) && normalizar(String(s.codigo)) === normalizar(stagingSystem ?? ''),
  );
  return listaDe(sistema?.valores).find((v) => normalizar(v) === normalizar(stageValue ?? ''));
}

/** El valor de gradación del catálogo que aparece como palabras completas dentro del texto del grado (`ISUP 3` no es `ISUP 35`). */
function gradoDe(resumen: ResumenParaPreguntas, tipo: string, catalogos: CatalogosDeLasPreguntas) {
  const grado = normalizar(resumen.diagnosis?.grade ?? '');
  if (grado === '') return undefined;
  return catalogos.escalas.sistemasDeGradacion
    .filter((s) => delTipo(s, tipo))
    .flatMap((s) => listaDe(s.valores))
    .find((valor) => ` ${grado} `.includes(` ${normalizar(valor)} `));
}

/** El primer biomarcador de `datos-criticos` (en su orden) que el caso trae: su etiqueta y, solo si es del catálogo, su valor. */
function biomarcadorDe(resumen: ResumenParaPreguntas, tipo: string, catalogos: CatalogosDeLasPreguntas) {
  const delCaso = new Map(resumen.recentBiomarkers.map((b) => [normalizar(b.name), b.value]));
  for (const item of catalogos.datosCriticos[tipo]?.items ?? []) {
    const nombre = textoDe(((item.destination as Entrada | undefined)?.match as Entrada | undefined)?.name);
    if (nombre === undefined || !delCaso.has(normalizar(nombre))) continue;
    const valores = catalogos.escalas.valoresDeBiomarcador.find(
      (b) => delTipo(b, tipo) && normalizar(String(b.nombre)) === normalizar(nombre),
    );
    const valor = listaDe(valores?.valores).find((v) => normalizar(v) === normalizar(String(delCaso.get(normalizar(nombre)))));
    const etiqueta = etiquetaDe(catalogos, tipo, nombre) ?? nombre;
    return valor === undefined ? etiqueta : `${etiqueta} ${valor}`;
  }
  return undefined;
}

function ranurasDelCaso(resumen: ResumenParaPreguntas, tipo: string, catalogos: CatalogosDeLasPreguntas): Ranuras {
  return {
    tipo: etiquetaDe(catalogos, tipo, tipo),
    estadio: estadioDe(resumen, tipo, catalogos),
    grado: gradoDe(resumen, tipo, catalogos),
    biomarcador: biomarcadorDe(resumen, tipo, catalogos),
  };
}

const rellenar = (texto: string, ranuras: Ranuras): string =>
  texto.replace(/\{(\w+)\}/g, (_, nombre: string) => ranuras[nombre] ?? '');

/**
 * Hasta 4 preguntas guiadas de una conversación nueva (US-267, ADR-52, RN-27): cada plantilla del catálogo ofrece la
 * primera de sus variantes cuyas ranuras se resuelven; el tema se copia por código del catálogo versionado desde
 * `diagnosis` y `recentBiomarkers`, nunca de texto libre, del `pseudoPatientId` ni de la identidad (RN-10, RN-11).
 * Sin tipo de cáncer con etiqueta en el catálogo no se ofrece ninguna. Función pura: sin E/S ni LLM.
 */
export function armarPreguntasGuiadas(
  resumen: ResumenParaPreguntas,
  catalogos: CatalogosDeLasPreguntas,
): string[] {
  const tipo = resumen.diagnosis?.cancerType;
  if (!tipo || !Object.hasOwn(catalogos.plantillas, tipo)) return [];
  const ranuras = ranurasDelCaso(resumen, tipo, catalogos);
  if (ranuras.tipo === undefined) return [];
  return catalogos.plantillas[tipo]!.items
    .flatMap((item) => {
      const variante = item.variantes.find((v) => v.ranuras.every((r) => ranuras[r] !== undefined));
      return variante ? [rellenar(variante.texto, ranuras)] : [];
    })
    .slice(0, MAXIMO_DE_PREGUNTAS);
}
