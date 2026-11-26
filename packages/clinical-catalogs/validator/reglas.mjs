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
    tiposDeDocumento: item.sourceDocumentTypes.items.enum,
    // La marca `revision_provisional` (S7, D9) se define una sola vez en `comun`: roles y fecha salen de ahí.
    rolesDeRevisionProvisional: esquemas.comun.$defs.revisionProvisional.properties.rol.enum,
    fechaDeRevisionProvisional: new RegExp(
      esquemas.comun.$defs.revisionProvisional.properties.fecha.pattern,
    ),
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
  // En aplicabilidad `attribute_key` puede ser una lista: todas deben estar declaradas. En datos críticos el
  // esquema solo admite una cadena y rechaza la lista después.
  const claves = [item.destination.match?.attribute_key].flat();
  const declarada = (clave) =>
    atributos.keys.some(
      (atributo) =>
        esObjeto(atributo) &&
        atributo.key === clave &&
        Array.isArray(atributo.cancerTypes) &&
        atributo.cancerTypes.includes(tipo),
    );
  return claves.every(declarada) ? null : 'atributo_no_declarado';
}

/**
 * RN-29 (d5fb-04): un `satisfiedBy` apunta a un atributo clínico declarado en `atributos.json` para el tipo de cáncer y a
 * uno de sus valores permitidos; una referencia colgante falla nombrando la clave (nunca valores del paciente).
 */
export function exigirCumplimientoAlternativoDeclarado(item, tipo, atributos, allowlist) {
  const cumplimientos = Array.isArray(item.satisfiedBy) ? item.satisfiedBy.filter(esObjeto) : [];
  for (const { entity, attribute_key: clave, value } of cumplimientos) {
    if (entity !== 'ClinicalAttribute' || !Object.hasOwn(allowlist.entidades, entity)) {
      return { codigo: 'cumplimiento_alternativo_invalido', campo: String(clave) };
    }
    const declarado = atributos.keys.find(
      (atributo) =>
        esObjeto(atributo) &&
        atributo.key === clave &&
        Array.isArray(atributo.cancerTypes) &&
        atributo.cancerTypes.includes(tipo),
    );
    if (declarado === undefined) return { codigo: 'atributo_no_declarado', campo: String(clave) };
    const valores = Array.isArray(declarado.values) ? declarado.values.map((v) => v?.value) : null;
    if (valores !== null && !valores.includes(value)) {
      return { codigo: 'valor_no_declarado', campo: String(clave) };
    }
  }
  return null;
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

/**
 * US-263 (RN-29): todo dato crítico declara en qué tipos de documento (`document_type`) debería estar: array no vacío,
 * sin repetidos y dentro del vocabulario cerrado del esquema. Con él, `clinical-api` distingue «no buscado» de «no
 * encontrado». Es una propuesta (`estado`) hasta DEC-01.
 */
export function exigirFuentesDeDocumento(item, vocabulario) {
  const tipos = item.sourceDocumentTypes;
  const validos =
    Array.isArray(tipos) &&
    tipos.length > 0 &&
    new Set(tipos).size === tipos.length &&
    tipos.every((tipo) => vocabulario.tiposDeDocumento.includes(tipo));
  return validos ? null : 'fuente_documental_invalida';
}

/** AC-04.4, P-03: `estado` dentro del vocabulario cerrado. */
export function exigirEstadoValido(item, vocabulario) {
  return vocabulario.estados.includes(item.estado) ? null : 'estado_invalido';
}

/**
 * S7 (design D9): `revision_provisional` con un rol del vocabulario del esquema común y una fecha ISO. Nombra el campo
 * (`rol` o `fecha`), nunca su valor. Va antes que el esquema para que el mensaje diga qué criterio y qué campo.
 */
export function exigirRevisionProvisionalValida(item, vocabulario) {
  const marca = item.revision_provisional;
  if (marca === undefined) return null;
  const { rol, fecha } = esObjeto(marca) ? marca : {};
  if (!vocabulario.rolesDeRevisionProvisional.includes(rol)) {
    return { codigo: 'revision_provisional_invalida', campo: 'rol' };
  }
  return typeof fecha === 'string' && vocabulario.fechaDeRevisionProvisional.test(fecha)
    ? null
    : { codigo: 'revision_provisional_invalida', campo: 'fecha' };
}

/** Cadena de ascendientes de `categoria` según `subsetOf`; `true` si vuelve a una categoría ya recorrida (ciclo). */
function formaCiclo(categoria, subsetOf) {
  const vistas = new Set();
  for (let actual = categoria; actual !== undefined; actual = subsetOf[actual]) {
    if (vistas.has(actual)) return true;
    vistas.add(actual);
  }
  return false;
}

/**
 * S7 (design D11): `rule.subsetOf` solo relaciona categorías declaradas en `rule.equivalences`, ninguna consigo misma y
 * sin ciclos (el lector del catálogo recorre los ascendientes y un ciclo no terminaría).
 */
export function exigirSubconjuntoDeclarado(item) {
  const subsetOf = item.rule?.subsetOf;
  if (!esObjeto(subsetOf)) return null; // la forma la rechaza el esquema
  const categorias = esObjeto(item.rule.equivalences) ? Object.keys(item.rule.equivalences) : [];
  const declaradas = Object.entries(subsetOf).every(
    ([hijo, padre]) => hijo !== padre && categorias.includes(hijo) && categorias.includes(padre),
  );
  const sinCiclos = Object.keys(subsetOf).every((hijo) => !formaCiclo(hijo, subsetOf));
  return declaradas && sinCiclos ? null : 'subconjunto_sin_equivalencia';
}

/** Campos que un criterio de aplicabilidad no puede declarar (RN-28: la aplicabilidad no lleva puntaje ni ponderación). */
const CAMPOS_DE_PUNTAJE = ['peso', 'puntaje', 'ponderacion', 'puntos', 'score', 'weight'];

/** Subárboles cuyas claves son datos del catálogo, no campos del criterio: valores canónicos y columnas del modelo. */
const SUBARBOLES_DE_DATOS = ['equivalences', 'match'];

/** Primer campo de puntaje (en minúsculas) entre las claves propias del criterio, a cualquier profundidad, o `undefined`. */
function campoDePuntajeEn(valor) {
  if (Array.isArray(valor)) return valor.map(campoDePuntajeEn).find(Boolean);
  if (!esObjeto(valor)) return undefined;
  const propio = Object.keys(valor)
    .map((clave) => clave.toLowerCase())
    .find((clave) => CAMPOS_DE_PUNTAJE.includes(clave));
  return (
    propio ??
    Object.entries(valor)
      .filter(([clave]) => !SUBARBOLES_DE_DATOS.includes(clave))
      .map(([, interior]) => campoDePuntajeEn(interior))
      .find(Boolean)
  );
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

/**
 * Huella recalculada del contenido que cubre `validation.scope`, o `undefined` si el archivo no tiene bloque
 * `validation` o la forma no es la esperada (no es un hash distinto: lo rechaza el esquema, que garantiza la forma).
 */
function huellaRecalculadaDe(archivo) {
  if (!esObjeto(archivo) || !esObjeto(archivo.validation)) return undefined;
  const { scope } = archivo.validation;
  const formaEsperada =
    Array.isArray(scope) && Array.isArray(archivo.items) && archivo.items.every(esObjeto);
  return formaEsperada ? catalogHashDe(scope, archivo.items) : undefined;
}

/** AC-04.4: el hash del contenido cubierto por `validation.scope` coincide con `validation.catalogHash`. */
export function verificarCatalogHash(archivo) {
  const recalculada = huellaRecalculadaDe(archivo);
  if (recalculada === undefined) return null;
  return recalculada === archivo.validation.catalogHash ? null : 'hash_distinto';
}

/** ¿El archivo declara una revisión de la IA (`reviewerRole = ia`) o un estado provisional sin el otro (S7, D14)? */
function validacionProvisionalIncoherente({ status, reviewerRole }) {
  return (status === 'revision_provisional') !== (reviewerRole === 'ia');
}

/** ¿Alguna entrada de `history` lleva la huella vigente (la declarada o la recalculada)? Sería atribuirla a otro rol. */
function historialConHuellaVigente({ history, catalogHash }, huellaRecalculada) {
  return (
    Array.isArray(history) &&
    history.some(
      (entrada) =>
        esObjeto(entrada) &&
        (entrada.catalogHash === catalogHash || entrada.catalogHash === huellaRecalculada),
    )
  );
}

/**
 * Códigos del bloque `validation` de un archivo (AC-04.4 y S7, `[S7 resp. 9]`): el hash del contenido cubierto, la
 * coherencia entre `status` y `reviewerRole` de la revisión provisional y que el historial no lleve la huella vigente.
 * Una forma inesperada no es un incumplimiento de estas reglas: la rechaza el esquema.
 */
export function verificarBloqueValidation(archivo) {
  if (!esObjeto(archivo) || !esObjeto(archivo.validation)) return [];
  const { validation } = archivo;
  return [
    verificarCatalogHash(archivo),
    validacionProvisionalIncoherente(validation) ? 'validacion_provisional_incoherente' : null,
    historialConHuellaVigente(validation, huellaRecalculadaDe(archivo))
      ? 'historial_con_huella_vigente'
      : null,
  ].filter(Boolean);
}
