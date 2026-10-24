import { catalogHashDe } from './canonico.mjs';

/**
 * Reglas con nombre del validador del catálogo (L1D-93 D2, RN-29). Cada una recibe un ítem (o archivo) ya leído y
 * devuelve el código estable de su incumplimiento o `null`. Códigos cerrados: son lo que viaja al log (AC-6).
 */

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);

/** Vocabulario cerrado que declara el esquema de datos críticos: una sola fuente para esquema y reglas. */
export function vocabularioDe(esquemaDeDatosCriticos) {
  const item = esquemaDeDatosCriticos.$defs.item.properties;
  const condicion = esquemaDeDatosCriticos.$defs.condicion.properties;
  return {
    estados: item.estado.enum,
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
  if (segundo === undefined) return allowlist.entidades[entidad].campos.includes(primero);
  const destino = allowlist.entidades[entidad].relaciones[primero];
  return destino !== undefined && allowlist.entidades[destino].campos.includes(segundo);
}

/** RN-29, FR-23, RN-10: entidad, campo y claves de `match` existen en la allowlist del modelo (solo entidades clínicas). */
export function exigirDestinoExistente(item, allowlist) {
  const { entity, field, match } = item.destination;
  if (!Object.hasOwn(allowlist.entidades, entity)) return 'destino_inexistente';
  const claves = [field, ...Object.keys(esObjeto(match) ? match : {})].filter((clave) => clave !== undefined);
  const existen = claves.every((clave) => typeof clave === 'string' && existeElCampo(clave, entity, allowlist));
  return existen ? null : 'destino_inexistente';
}

/** RN-29: un destino en `ClinicalAttribute` usa una `attribute_key` declarada en `atributos.json` para el tipo. */
export function exigirAtributoDeclarado(item, tipo, atributos) {
  if (item.destination.entity !== 'ClinicalAttribute') return null;
  const clave = item.destination.match?.attribute_key;
  const declarado = atributos.keys.some((atributo) => atributo.key === clave && atributo.cancerTypes.includes(tipo));
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
  return referenciaValida && operadorValido && valoresValidos && respuestaValida ? null : 'condicion_invalida';
}

/** AC-04.4, P-03: `estado` dentro del vocabulario cerrado. */
export function exigirEstadoValido(item, vocabulario) {
  return vocabulario.estados.includes(item.estado) ? null : 'estado_invalido';
}

/** AC-04.4: el hash del contenido cubierto por `validation.scope` coincide con `validation.catalogHash`. */
export function verificarCatalogHash(archivo) {
  if (archivo.validation === undefined) return null;
  const { scope, catalogHash } = archivo.validation;
  return catalogHashDe(scope, archivo.items) === catalogHash ? null : 'hash_distinto';
}
