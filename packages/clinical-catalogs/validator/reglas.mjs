import { catalogHashDe } from './canonico.mjs';

/**
 * Reglas con nombre del validador del catálogo (L1D-93 D2, RN-29). Cada una recibe un ítem (o archivo) ya leído y
 * devuelve el código estable de su incumplimiento o `null`. Códigos cerrados: son lo que viaja al log (AC-6).
 */

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);

/** Vocabulario cerrado que declaran los esquemas (`comun`, `datos-criticos`): una sola fuente para esquema y reglas. */
export function vocabularioDe(esquemas) {
  const item = esquemas['datos-criticos'].$defs.item.properties;
  const condicion = esquemas['datos-criticos'].$defs.condicion.properties;
  return {
    estados: esquemas.comun.$defs.estado.enum,
    operadores: condicion.operator.enum,
    respuestasSiDesconocida: item.whenConditionUnknown.enum,
  };
}

/** RN-29: todo ítem con destino lo declara. */
export function exigirDestino(item) {
  return esObjeto(item.destination) ? null : 'destino_ausente';
}

/** Campo de columna de `entidad` o, con `relacion.campo`, de la entidad que enlaza una relación directa. */
function existeElCampo(clave, entidad, allowlist) {
  const [primero, segundo] = clave.split('.');
  const delaEntidad = allowlist.entidades[entidad];
  if (segundo === undefined) return delaEntidad.campos.includes(primero);
  // `hasOwn`: una clave como `constructor` no debe resolverse por el prototipo.
  if (!Object.hasOwn(delaEntidad.relaciones, primero)) return false;
  const destino = delaEntidad.relaciones[primero];
  return (
    Object.hasOwn(allowlist.entidades, destino) &&
    allowlist.entidades[destino].campos.includes(segundo)
  );
}

/** RN-29, FR-23, RN-10: entidad, campo y claves de `match` existen en la allowlist del modelo (solo entidades clínicas). */
export function exigirDestinoExistente(item, allowlist) {
  if (!esObjeto(item.destination)) return null; // lo señala exigirDestino
  const { entity, field, match } = item.destination;
  if (!Object.hasOwn(allowlist.entidades, entity)) return 'destino_inexistente';
  const claves = [field, ...Object.keys(esObjeto(match) ? match : {})].filter(
    (clave) => clave !== undefined,
  );
  const existen = claves.every(
    (clave) => typeof clave === 'string' && existeElCampo(clave, entity, allowlist),
  );
  return existen ? null : 'destino_inexistente';
}

/** RN-29: un destino en `ClinicalAttribute` usa una `attribute_key` declarada en `atributos.json` para el tipo. */
export function exigirAtributoDeclarado(item, tipo, atributos) {
  if (!esObjeto(item.destination) || item.destination.entity !== 'ClinicalAttribute') return null;
  const clave = item.destination.match?.attribute_key;
  const declarado = atributos.keys.some(
    (atributo) =>
      esObjeto(atributo) &&
      atributo.key === clave &&
      Array.isArray(atributo.cancerTypes) &&
      atributo.cancerTypes.includes(tipo),
  );
  return declarado ? null : 'atributo_no_declarado';
}

/** AC-04.4: la condición es declarativa, apunta a un ítem del mismo tipo y declara qué pasa si su valor se desconoce. */
export function exigirCondicionBienFormada(item, clavesDelTipo, vocabulario) {
  const { condition } = item;
  if (condition === undefined) return null;
  const referenciaValida = esObjeto(condition) && clavesDelTipo.includes(condition.item);
  const operadorValido = vocabulario.operadores.includes(condition?.operator);
  const valoresValidos = Array.isArray(condition?.values) && condition.values.length > 0;
  const respuestaValida = vocabulario.respuestasSiDesconocida.includes(item.whenConditionUnknown);
  return referenciaValida && operadorValido && valoresValidos && respuestaValida
    ? null
    : 'condicion_invalida';
}

/** Valores de `campo` (por defecto `key`) que aparecen más de una vez entre los ítems de un archivo de un tipo de cáncer. */
export function clavesRepetidasEn(items, campo = 'key') {
  const vistas = new Set();
  const repetidas = new Set();
  for (const item of items) {
    if (vistas.has(item[campo])) repetidas.add(item[campo]);
    vistas.add(item[campo]);
  }
  return repetidas;
}

/** RN-29: la clave de un ítem es única por tipo de cáncer y archivo (una clave repetida haría ambigua una referencia). */
export function exigirClaveUnica(item, clavesRepetidas) {
  return clavesRepetidas.has(item.key) ? 'clave_duplicada' : null;
}

/** AC-04.4, P-03: `estado` dentro del vocabulario cerrado. */
export function exigirEstadoValido(item, vocabulario) {
  return vocabulario.estados.includes(item.estado) ? null : 'estado_invalido';
}

/** Campos que un criterio de aplicabilidad no puede declarar (RN-28: la aplicabilidad no lleva puntaje ni ponderación). */
const CAMPOS_DE_PUNTAJE = ['peso', 'score', 'weight'];

/** Primer campo de puntaje (en minúsculas, a cualquier profundidad) dentro de `valor`, o `undefined`. */
function campoDePuntajeEn(valor) {
  if (Array.isArray(valor)) return valor.map(campoDePuntajeEn).find(Boolean);
  if (!esObjeto(valor)) return undefined;
  const propio = Object.keys(valor)
    .map((clave) => clave.toLowerCase())
    .find((clave) => CAMPOS_DE_PUNTAJE.includes(clave));
  return propio ?? Object.values(valor).map(campoDePuntajeEn).find(Boolean);
}

/** RN-28: ningún campo de puntaje o ponderación en un criterio. Nombra el campo canónico, nunca la clave tal como venga. */
export function rechazarCamposDePuntaje(criterio) {
  const campo = campoDePuntajeEn(criterio);
  return campo === undefined ? null : { codigo: 'campo_de_puntaje', campo };
}

/** Claves de población declaradas para un tipo de cáncer en `poblacion.json`. */
const clavesDePoblacionDe = (poblacion, tipo) =>
  poblacion.keys
    .filter(
      (clave) =>
        esObjeto(clave) && Array.isArray(clave.cancerTypes) && clave.cancerTypes.includes(tipo),
    )
    .map((clave) => clave.key);

/** FR-25: `studyKey` presente, declarada en `poblacion.json` para el tipo de cáncer y única entre los criterios del archivo. */
export function exigirStudyKey(item, tipo, poblacion, studyKeysRepetidas) {
  const { studyKey } = item;
  if (typeof studyKey !== 'string' || studyKey === '') return 'study_key_ausente';
  if (!clavesDePoblacionDe(poblacion, tipo).includes(studyKey)) return 'study_key_inexistente';
  return studyKeysRepetidas.has(studyKey) ? 'study_key_duplicada' : null;
}

/** AC-04.4: el hash del contenido cubierto por `validation.scope` coincide con `validation.catalogHash`. */
export function verificarCatalogHash(archivo) {
  if (!esObjeto(archivo) || !esObjeto(archivo.validation)) return null;
  const { scope, catalogHash } = archivo.validation;
  const formaEsperada =
    Array.isArray(scope) && Array.isArray(archivo.items) && archivo.items.every(esObjeto);
  // Una forma inesperada no es un hash distinto: la rechaza el esquema, que es quien garantiza la forma.
  if (!formaEsperada) return null;
  return catalogHashDe(scope, archivo.items) === catalogHash ? null : 'hash_distinto';
}
