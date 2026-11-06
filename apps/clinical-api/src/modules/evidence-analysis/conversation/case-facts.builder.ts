import type {
  CaseFact,
  ClinicalContext,
} from '../../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { type DatoDelContexto, verbalizarHechoDelCaso } from '../analysis-basis.verbalizacion.js';
import { fechaConfiable } from '../clinical-context.builder.js';
import type {
  CasoClinico,
  MetodoDeIngreso,
  PrecisionDeFecha,
} from '../evidence-analysis.repository.js';
import type { EnlaceDeDato, MapaDeDataRefs } from '../ports.js';

/**
 * Lo que Backend 1 recuerda de un `factRef` (US-260): qué registro es y de dónde sale su fecha. Vive solo en memoria del
 * turno y nunca viaja a Backend 2 (RN-10, RN-11): el `recordedDate` se toma del registro, jamás del LLM.
 */
export interface EnlaceDeHecho extends EnlaceDeDato {
  origin: MetodoDeIngreso;
  relativeDay: number | null;
  recordedDate: string | null;
}

export type TablaDeHechos = ReadonlyMap<string, EnlaceDeHecho>;

export interface HechosDelCaso {
  /** Para `caseFacts` de `/chat/turn`: `factRef` opaco, verbalización determinista y día relativo; sin UUID ni fechas. */
  hechos: CaseFact[];
  tabla: TablaDeHechos;
}

const MS_POR_DIA = 86_400_000;

/** Días enteros de `desde` a `hasta` (`AAAA-MM-DD`); negativos si el dato es anterior al diagnóstico. */
function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_POR_DIA,
  );
}

interface FechaDelDato {
  fecha: string | null;
}

function fechaDeFila(caso: CasoClinico, enlace: EnlaceDeDato): FechaDelDato {
  const confiable = (fecha: string | null, precision: PrecisionDeFecha) => ({
    fecha: fechaConfiable(fecha, precision),
  });
  switch (enlace.tabla) {
    case 'diagnosis':
      return { fecha: caso.diagnosticoActivo?.diagnosedAt ?? null };
    case 'biomarker':
      return { fecha: caso.biomarcadores.find((f) => f.id === enlace.id)?.performedAt ?? null };
    case 'clinical_attribute': {
      const fila = caso.atributos.find((f) => f.id === enlace.id);
      return fila === undefined ? { fecha: null } : confiable(fila.observedAt, fila.datePrecision);
    }
    case 'prior_treatment':
      return { fecha: caso.tratamientosPrevios.find((f) => f.id === enlace.id)?.startedAt ?? null };
    case 'clinical_event': {
      const fila = caso.eventos.find((f) => f.id === enlace.id);
      return fila === undefined ? { fecha: null } : confiable(fila.eventDate, fila.datePrecision);
    }
  }
}

/** Un dato del contexto enmascarado en el orden de lectura: diagnóstico, biomarcadores, atributos, tratamientos y eventos. */
function datosEnOrden(contexto: ClinicalContext): { kind: string; dato: DatoDelContexto }[] {
  return [
    ...(contexto.diagnosis === null
      ? []
      : [
          { kind: 'diagnostico', dato: { tipo: 'diagnostico', dato: contexto.diagnosis } as const },
        ]),
    ...contexto.biomarkers.map((dato) => ({
      kind: 'biomarcador',
      dato: { tipo: 'biomarcador', dato } as const,
    })),
    ...contexto.attributes.map((dato) => ({
      kind: 'atributo',
      dato: { tipo: 'atributo', dato } as const,
    })),
    ...contexto.priorTreatments.map((dato) => ({
      kind: 'tratamiento',
      dato: { tipo: 'tratamiento', dato } as const,
    })),
    ...contexto.events.map((dato) => ({
      kind: 'evento',
      dato: { tipo: 'evento', dato } as const,
    })),
  ];
}

/** Clave de la serie de un biomarcador: su nombre en minúsculas y sin separadores (`CA 15-3` → `ca153`). */
function claveDeSerie(nombre: string): string {
  return nombre.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

/**
 * `caseFacts[]` de un turno del chat (US-260, ADR-34) desde el contexto YA desidentificado: la verbalización sale del
 * texto enmascarado, el `factRef` es opaco por turno (`f1`, `f2`…) y el día relativo se calcula con la fecha del registro
 * respecto del diagnóstico (`null` sin fecha confiable, nunca `0`). El contexto solo trae datos vigentes (RN-07: el
 * repositorio excluye `rechazado` y `reemplazado`), así que una corrección vigente reemplaza al dato que sustituyó.
 */
export function construirHechosDelCaso(
  contexto: ClinicalContext,
  dataRefs: MapaDeDataRefs,
  caso: CasoClinico,
): HechosDelCaso {
  const fechaDelDiagnostico = caso.diagnosticoActivo?.diagnosedAt ?? null;
  const tabla = new Map<string, EnlaceDeHecho>();
  const hechos: CaseFact[] = [];
  for (const { kind, dato } of datosEnOrden(contexto)) {
    const enlace = dataRefs.get(dato.dato.dataRef);
    if (enlace === undefined) continue; // un dato del contexto sin respaldo no puede citarse
    const factRef = `f${hechos.length + 1}`;
    const { fecha } = fechaDeFila(caso, enlace);
    const relativeDay =
      fecha === null || fechaDelDiagnostico === null ? null : diasEntre(fechaDelDiagnostico, fecha);
    const { provenance } = dato.dato;
    tabla.set(factRef, {
      ...enlace,
      origin: provenance.entryMethod,
      relativeDay,
      recordedDate: fecha,
    });
    hechos.push({
      factRef,
      kind,
      verbalization: verbalizarHechoDelCaso(dato),
      relativeDay,
      reviewStatus: provenance.reviewStatus,
      ...(dato.tipo === 'biomarcador' ? { seriesKey: claveDeSerie(dato.dato.biomarkerName) } : {}),
      ...(provenance.entryMethod === 'manual_correction' || provenance.reviewStatus === 'corregido'
        ? { corrected: true }
        : {}),
    });
  }
  return { hechos, tabla };
}
