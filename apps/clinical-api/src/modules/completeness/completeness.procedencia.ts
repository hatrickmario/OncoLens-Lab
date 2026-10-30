import type {
  EstadoDelChecklist,
  ItemDeDatoCritico,
  ItemDelChecklist,
  OrigenDelItem,
  ProcedenciaDelItem,
  RegistroDeDato,
} from './ports.js';

/**
 * Origen y procedencia de un ítem del checklist (US-003, design D1): función pura que deriva del registro que contó
 * lo que el motor de estados no calcula. Nunca lleva el texto del fragmento ni el nombre del archivo (RN-10).
 */

type ProcedenciaDeSalida = Pick<
  ItemDelChecklist,
  'origin' | 'provenance' | 'destination' | 'condition'
>;

const ORIGEN_POR_METODO_DE_ENTRADA: Readonly<
  Record<ProcedenciaDelItem['entryMethod'], Exclude<OrigenDelItem, 'regla'>>
> = {
  ocr: 'documento',
  manual: 'manual',
  manual_correction: 'correccion',
  seed: 'seed',
};

function esMetodoDeEntradaDeclarado(metodo: string): metodo is ProcedenciaDelItem['entryMethod'] {
  return Object.hasOwn(ORIGEN_POR_METODO_DE_ENTRADA, metodo);
}

function procedenciaDelRegistro(registro: RegistroDeDato): ProcedenciaDelItem {
  const { entryMethod, sourceDocumentId, page } = registro.procedencia;
  if (!esMetodoDeEntradaDeclarado(entryMethod)) throw new Error('entry_method_desconocido');
  return {
    entryMethod,
    // El estado ya es vigente (ni rechazado ni reemplazado): el contrato solo declara estos cuatro.
    reviewStatus: registro.reviewStatus as ProcedenciaDelItem['reviewStatus'],
    sourceDocumentId,
    ...(sourceDocumentId !== null && page !== null && { page }),
  };
}

export function procedenciaDeItem(
  item: ItemDeDatoCritico,
  estado: EstadoDelChecklist,
  registro: RegistroDeDato | undefined,
): ProcedenciaDeSalida {
  const destination = { entity: item.destination.entity, field: item.destination.field ?? null };
  if (estado === 'faltante' || estado === 'no_aplica') {
    return {
      origin: 'regla',
      provenance: null,
      destination,
      condition: estado === 'no_aplica' ? (item.condition ?? null) : null,
    };
  }
  if (registro === undefined) throw new Error('registro_ausente');
  const provenance = procedenciaDelRegistro(registro);
  return {
    origin: ORIGEN_POR_METODO_DE_ENTRADA[provenance.entryMethod],
    provenance,
    destination,
    condition: null,
  };
}
