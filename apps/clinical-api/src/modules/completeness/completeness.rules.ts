import { elegirDiagnosticoVigente } from '../compartido/diagnostico-vigente.js';
import { ESTADOS_DESCARTADOS } from '../compartido/estados-de-revision.js';
import type {
  CondicionDeItem,
  ChecklistDelPaciente,
  DestinoDeItem,
  EstadoDelChecklist,
  EstadoDeItem,
  ItemDeDatoCritico,
  ItemDelChecklist,
  RegistroDeDato,
  RegistrosPorEntidad,
  ResueltoPor,
  TipoDeVacio,
} from './ports.js';

/**
 * Motor puro del checklist de datos críticos (US-002, FR-23): sin E/S, sin reloj ni azar. Las reglas leen del
 * catálogo (RN-22) y su orden es el de cinco pasos de la historia; cada paso tiene su función con nombre.
 */

/** El catálogo no es coherente (operador o ítem referenciado inexistente): el validador del arranque debió impedirlo. */
export class CatalogoInconsistenteError extends Error {
  constructor(detalle: string) {
    super(`catalogo_inconsistente ${detalle}`);
    this.name = 'CatalogoInconsistenteError';
  }
}

type ResultadoDeCondicion = 'cumple' | 'no_cumple' | 'no_evaluable';

/** Paso 3 (RN-07): un registro rechazado o reemplazado nunca cuenta. */
export function registrosVigentes(registros: readonly RegistroDeDato[]): RegistroDeDato[] {
  return registros.filter(
    (registro) => !(ESTADOS_DESCARTADOS as readonly string[]).includes(registro.reviewStatus),
  );
}

/** Orden total y determinista: fecha (sin fecha = la más antigua), luego creación y por último id. */
function esMasReciente(candidato: RegistroDeDato, actual: RegistroDeDato): boolean {
  const claveDe = (r: RegistroDeDato) => [r.fecha ?? '', r.creadoEn, r.id];
  const a = claveDe(candidato);
  const b = claveDe(actual);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return false;
}

/** Paso 4: el registro que cuenta es el más reciente aunque no esté verificado. */
export function registroQueCuenta(
  registros: readonly RegistroDeDato[],
): RegistroDeDato | undefined {
  return registros.reduce<RegistroDeDato | undefined>(
    (actual, candidato) =>
      actual === undefined || esMasReciente(candidato, actual) ? candidato : actual,
    undefined,
  );
}

export function estadoDeVerificacion(
  registro: RegistroDeDato,
  verifiedReviewStatuses: readonly string[],
): 'presente_verificado' | 'presente_sin_verificar' {
  return verifiedReviewStatuses.includes(registro.reviewStatus)
    ? 'presente_verificado'
    : 'presente_sin_verificar';
}

/**
 * El `Diagnosis` vigente entre los no descartados (RN-07), por la regla única de `compartido/diagnostico-vigente`: la
 * misma de la ficha y el listado. Todas las salidas del checklist se calculan sobre este mismo registro.
 */
export function diagnosticoVigente(
  diagnosticos: readonly RegistroDeDato[],
): RegistroDeDato | undefined {
  return elegirDiagnosticoVigente(registrosVigentes(diagnosticos), (d) => ({
    id: d.id,
    fecha: d.fecha,
  }));
}

/** Paso 1: el tipo de cáncer sale del `Diagnosis` vigente; `null` si no hay. */
export function tipoDeCancerActivo(diagnosticosActivos: readonly RegistroDeDato[]): string | null {
  const activo = diagnosticoVigente(diagnosticosActivos);
  const tipo = activo?.columnas['cancer_type'];
  return typeof tipo === 'string' ? tipo : null;
}

export function itemsDelTipoActivo(
  items: readonly ItemDeDatoCritico[],
  cancerType: string,
): ItemDeDatoCritico[] {
  return items.filter((item) => item.cancerType === cancerType);
}

/**
 * Coincidencia de destino (design D5): columnas de `match` iguales y, si el destino declara campo, con valor.
 * En un `no_mapeado`, `name` es el texto propuesto, sin validar contra el catálogo: coincide si es igual al del
 * destino. Nunca se empareja por `original_name` ni por similitud (RN-27: sería asignar un concepto sin mapeo). El
 * estado del dato sale de `review_status`, no de `mapping_status`.
 */
function registrosDelDestino(
  destino: DestinoDeItem,
  registros: readonly RegistroDeDato[],
): RegistroDeDato[] {
  return registros.filter((registro) => {
    if (destino.field !== undefined && (registro.columnas[destino.field] ?? null) === null)
      return false;
    return Object.entries(destino.match ?? {}).every(
      ([columna, valor]) => registro.columnas[columna] === valor,
    );
  });
}

/**
 * `prefijo` es `startsWith` exacto: distingue mayúsculas y espacios, sin normalizar (`"2+ (IHQ)"` activa `"2+"`;
 * `" 2+"` y `"iv"` contra `"IV"` no).
 */
function elValorCumpleElOperador(condicion: CondicionDeItem, valor: string): boolean {
  switch (condicion.operator) {
    case 'igualdad':
      return valor === condicion.values[0];
    case 'pertenencia':
      return condicion.values.includes(valor);
    case 'prefijo':
      return condicion.values.some((prefijo) => valor.startsWith(prefijo));
    default:
      throw new CatalogoInconsistenteError('operador_desconocido');
  }
}

/** Paso 2, evaluación declarativa de la condición sobre el valor del dato referenciado (`null` = no evaluable). */
export function evaluarCondicion(
  condicion: CondicionDeItem,
  valor: string | null,
): ResultadoDeCondicion {
  if (valor === null) return 'no_evaluable';
  return elValorCumpleElOperador(condicion, valor) ? 'cumple' : 'no_cumple';
}

function registrosQueCuentanDelItem(
  item: ItemDeDatoCritico,
  registros: RegistrosPorEntidad,
): RegistroDeDato[] {
  const destino = item.destination;
  const vigentes = registrosVigentes(registros[destino.entity] ?? []);
  return registrosDelDestino(destino, vigentes);
}

/**
 * La declaración vigente (RN-07) que el catálogo acepta como cumplimiento alternativo del ítem (`satisfiedBy`, RN-29),
 * la más reciente si hay varias; `undefined` si el ítem no declara `satisfiedBy` o no hay una que coincida en entidad,
 * clave y valor. No crea ni lee filas del destino: es la «ausencia declarada», no un registro inventado.
 */
export function declaracionQueCumple(
  item: ItemDeDatoCritico,
  registros: RegistrosPorEntidad,
): RegistroDeDato | undefined {
  const coincidentes = (item.satisfiedBy ?? []).flatMap((declaracion) =>
    registrosVigentes(registros[declaracion.entity] ?? []).filter(
      (registro) =>
        registro.columnas['attribute_key'] === declaracion.attribute_key &&
        registro.columnas['value'] === declaracion.value,
    ),
  );
  return registroQueCuenta(coincidentes);
}

/** El registro que cumple un ítem y por qué vía: el destino con `minValues` registros, o la declaración del catálogo. */
export interface CumplimientoDelItem {
  readonly registro: RegistroDeDato;
  readonly resolvedBy: ResueltoPor;
}

/** Paso 4: gana el destino si alcanza `minValues`; si no, una declaración vigente del catálogo; si no, `undefined`. */
export function cumplimientoDelItem(
  item: ItemDeDatoCritico,
  registros: RegistrosPorEntidad,
): CumplimientoDelItem | undefined {
  const propios = registrosQueCuentanDelItem(item, registros);
  const cuenta = registroQueCuenta(propios);
  if (cuenta !== undefined && propios.length >= item.minValues) {
    return { registro: cuenta, resolvedBy: 'registro' };
  }
  const declaracion = declaracionQueCumple(item, registros);
  return declaracion === undefined
    ? undefined
    : { registro: declaracion, resolvedBy: 'declaracion_de_ausencia' };
}

function valorDelRegistro(item: ItemDeDatoCritico, registro: RegistroDeDato): string | null {
  const campo = item.destination.field;
  const valor = campo === undefined ? null : (registro.columnas[campo] ?? null);
  return valor === null ? null : String(valor);
}

function estadoPorCondicion(
  item: ItemDeDatoCritico,
  delTipo: readonly ItemDeDatoCritico[],
  registros: RegistrosPorEntidad,
): 'no_aplica' | 'faltante' | 'aplica' {
  const condicion = item.condition;
  if (condicion === undefined) return 'aplica';
  const referenciado = delTipo.find((otro) => otro.key === condicion.item);
  if (referenciado === undefined)
    throw new CatalogoInconsistenteError('item_referenciado_inexistente');
  const cuenta = registroQueCuenta(registrosQueCuentanDelItem(referenciado, registros));
  const resultado = evaluarCondicion(
    condicion,
    cuenta === undefined ? null : valorDelRegistro(referenciado, cuenta),
  );
  if (resultado === 'cumple') return 'aplica';
  if (resultado === 'no_cumple') return 'no_aplica';
  if (item.whenConditionUnknown === undefined)
    throw new CatalogoInconsistenteError('whenConditionUnknown_ausente');
  return item.whenConditionUnknown;
}

function estadoDelItem(
  item: ItemDeDatoCritico,
  delTipo: readonly ItemDeDatoCritico[],
  verifiedReviewStatuses: readonly string[],
  registros: RegistrosPorEntidad,
): EstadoDelChecklist {
  const porCondicion = estadoPorCondicion(item, delTipo, registros);
  if (porCondicion !== 'aplica') return porCondicion;
  const cumplimiento = cumplimientoDelItem(item, registros);
  return cumplimiento === undefined
    ? 'faltante'
    : estadoDeVerificacion(cumplimiento.registro, verifiedReviewStatuses);
}

export interface EntradaDelChecklist {
  readonly cancerType: string;
  readonly items: readonly ItemDeDatoCritico[];
  readonly verifiedReviewStatuses: readonly string[];
  readonly registros: RegistrosPorEntidad;
}

/** Paso 5: un estado por ítem del tipo activo, en el orden del catálogo. */
export function calcularChecklist(entrada: EntradaDelChecklist): EstadoDeItem[] {
  const delTipo = itemsDelTipoActivo(entrada.items, entrada.cancerType);
  return delTipo.map((item) => ({
    key: item.key,
    status: estadoDelItem(item, delTipo, entrada.verifiedReviewStatuses, entrada.registros),
  }));
}

/** Cuántos registros vigentes (RN-07) tiene el destino del ítem: lo que se compara con `minValues`. */
export function cantidadDeRegistrosVigentes(
  item: ItemDeDatoCritico,
  registros: RegistrosPorEntidad,
): number {
  return registrosQueCuentanDelItem(item, registros).length;
}

const valorDelCampo = (item: ItemDeDatoCritico, registro: RegistroDeDato): string | null =>
  item.destination.field === undefined ? null : valorDelRegistro(item, registro);

/**
 * RN-08: ¿contradice algún registro con conflicto pendiente (`requiere_revision` y `conflicts_with_id`) al dato del
 * ítem? Solo cuenta el que cae en su destino con valor en el campo y, si hay dato que cuente, el que es ese mismo
 * registro o trae un valor distinto: un diagnóstico en conflicto por el estadio no pone en conflicto la histología
 * si la repite igual. El `status` del ítem no cambia; esto solo alimenta el tipo de vacío.
 */
export function hayConflictoPendiente(
  item: ItemDeDatoCritico,
  registros: RegistrosPorEntidad,
  conflictos: RegistrosPorEntidad,
): boolean {
  const enElDestino = registrosDelDestino(
    item.destination,
    conflictos[item.destination.entity] ?? [],
  );
  const cuenta = registroQueCuenta(registrosQueCuentanDelItem(item, registros));
  if (enElDestino.length === 0) return false;
  if (cuenta === undefined || item.destination.field === undefined) return true;
  return enElDestino.some(
    (conflicto) =>
      conflicto.id === cuenta.id || valorDelCampo(item, conflicto) !== valorDelCampo(item, cuenta),
  );
}

/** Lo que `clasificarVacio` necesita saber del paciente, además del estado del ítem (todo calculado fuera, sin E/S). */
export interface EvidenciaDelVacio {
  /** Registros vigentes (RN-07) que cuentan en el destino del ítem. */
  readonly registrosVigentes: number;
  /** Hay un registro vigente en `requiere_revision` con `conflicts_with_id` que contradice el dato del ítem (RN-08). */
  readonly conflictoPendiente: boolean;
  /** `document_type` de los documentos del paciente con `ocr_status = completado`. */
  readonly documentosProcesados: ReadonlySet<string>;
}

/**
 * Tipo de vacío del ítem (US-263, `[S6 resp. 10]`, `[S6 resp. 17]`). Prioridad: `por_conciliar` > `incompleto` >
 * `no_buscado` > `no_encontrado`; `null` si verificado y sin conflicto, o `no_aplica`. No cambia el `status`.
 */
export function clasificarVacio(
  item: ItemDeDatoCritico,
  estado: EstadoDelChecklist,
  evidencia: EvidenciaDelVacio,
): TipoDeVacio | null {
  if (estado === 'no_aplica') return null;
  if (evidencia.conflictoPendiente) return 'por_conciliar';
  if (estado === 'presente_sin_verificar') return 'incompleto';
  return estado === 'faltante' ? vacioDeUnFaltante(item, evidencia) : null;
}

/** Sin conflicto: con registros pero menos que `minValues` es `incompleto`; sin ninguno, depende de si se procesó un documento fuente. */
function vacioDeUnFaltante(item: ItemDeDatoCritico, evidencia: EvidenciaDelVacio): TipoDeVacio {
  if (evidencia.registrosVigentes > 0) return 'incompleto';
  const seBusco = item.sourceDocumentTypes.some((tipo) => evidencia.documentosProcesados.has(tipo));
  return seBusco ? 'no_encontrado' : 'no_buscado';
}

/** Los ítems en estado `faltante`, en el orden del catálogo: ÚNICA definición de «faltante» (contador, endpoint y análisis). */
export function faltantesDe(checklist: ChecklistDelPaciente): ItemDelChecklist[] {
  return checklist.items.filter((item) => item.status === 'faltante');
}
