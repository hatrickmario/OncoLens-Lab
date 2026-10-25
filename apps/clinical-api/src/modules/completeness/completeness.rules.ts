import { ESTADOS_DESCARTADOS } from '../patients/estados-de-revision.js';
import type {
  CondicionDeItem,
  DestinoDeItem,
  EstadoDelChecklist,
  ItemDeDatoCritico,
  ItemDelChecklist,
  RegistroDeDato,
  RegistrosPorEntidad,
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

/** Paso 1: el tipo de cáncer sale del `Diagnosis` activo vigente; `null` si no hay. */
export function tipoDeCancerActivo(diagnosticosActivos: readonly RegistroDeDato[]): string | null {
  const activo = registroQueCuenta(registrosVigentes(diagnosticosActivos));
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
 * Coincidencia de destino (design D5): columnas de `match` iguales y, si el destino declara campo, con valor. El
 * En un `no_mapeado`, `name` es el texto propuesto, sin validar contra el catálogo: coincide si es igual al del
 * destino. Nunca se empareja por `original_name` ni por similitud (RN-27: sería asignar un concepto sin mapeo). El
 * estado del dato sale de `review_status`, no de `mapping_status`.
 */
export function registrosDelDestino(
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
  const propios = registrosQueCuentanDelItem(item, registros);
  const cuenta = registroQueCuenta(propios);
  if (cuenta === undefined || propios.length < item.minValues) return 'faltante';
  return estadoDeVerificacion(cuenta, verifiedReviewStatuses);
}

export interface EntradaDelChecklist {
  readonly cancerType: string;
  readonly items: readonly ItemDeDatoCritico[];
  readonly verifiedReviewStatuses: readonly string[];
  readonly registros: RegistrosPorEntidad;
}

/** Paso 5: un estado por ítem del tipo activo, en el orden del catálogo. */
export function calcularChecklist(entrada: EntradaDelChecklist): ItemDelChecklist[] {
  const delTipo = itemsDelTipoActivo(entrada.items, entrada.cancerType);
  return delTipo.map((item) => ({
    key: item.key,
    status: estadoDelItem(item, delTipo, entrada.verifiedReviewStatuses, entrada.registros),
  }));
}
