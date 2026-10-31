import {
  exigirAtributoDeclarado,
  exigirCondicionBienFormada,
  exigirDestino,
  exigirDestinoExistente,
  clavesRepetidasEn,
  exigirClaveUnica,
  exigirEstadoValido,
  exigirStudyKey,
  rechazarCamposDePuntaje,
} from './reglas.mjs';

/**
 * Registro ÚNICO de los archivos por tipo que tienen ítems con destino (L1D-93, RN-29). Cada entrada nombra su
 * esquema (`schemas/<nombre>.schema.json`), las reglas que se aplican a cada uno de sus ítems y, opcionalmente,
 * `contexto(items)`: lo que sus reglas necesitan derivar de TODOS los ítems del archivo (p. ej. `studyKeysRepetidas`).
 * El lector, el compilador de esquemas y el recorrido del validador salen de aquí: un archivo nuevo (reglas de
 * supuestos, US-129) o una regla nueva se añaden en este único sitio; el recorrido solo mezcla el contexto.
 *
 * Una regla es `(item, contexto) => codigo | { codigo, campo } | null`. El `contexto` común trae `tipoDeCancer`,
 * `allowlist`, `atributos`, `poblacion`, `vocabulario`, `clavesDelTipo` y `clavesRepetidas`; el de la entrada se suma.
 * Todas toleran un ítem sin `destination` (lo señala `exigirDestino`).
 */
const REGLAS_DE_DESTINO = [
  (item) => exigirDestino(item),
  (item, { clavesRepetidas }) => exigirClaveUnica(item, clavesRepetidas),
  (item, { allowlist }) => exigirDestinoExistente(item, allowlist),
  (item, { tipoDeCancer, atributos }) => exigirAtributoDeclarado(item, tipoDeCancer, atributos),
];

export const ARCHIVOS_DEL_CATALOGO = {
  'datos-criticos': {
    esquema: 'datos-criticos',
    reglas: [
      ...REGLAS_DE_DESTINO,
      (item, { clavesDelTipo, vocabulario }) =>
        exigirCondicionBienFormada(item, clavesDelTipo, vocabulario),
      (item, { vocabulario }) => exigirEstadoValido(item, vocabulario),
    ],
  },
  aplicabilidad: {
    esquema: 'aplicabilidad',
    // Un `studyKey` ausente lo señala antes `exigirStudyKey`; por eso no hace falta filtrarlo aquí.
    contexto: (items) => ({ studyKeysRepetidas: clavesRepetidasEn(items, 'studyKey') }),
    reglas: [
      ...REGLAS_DE_DESTINO,
      (item) => rechazarCamposDePuntaje(item),
      (item, { tipoDeCancer, poblacion, studyKeysRepetidas }) =>
        exigirStudyKey(item, tipoDeCancer, poblacion, studyKeysRepetidas),
      (item, { vocabulario }) => exigirEstadoValido(item, vocabulario),
    ],
  },
};

/** Nombres de los archivos por tipo, en el orden del registro. */
export const NOMBRES_DE_ARCHIVO = Object.keys(ARCHIVOS_DEL_CATALOGO);

/**
 * Archivos por tipo que existen solo si el manifiesto los declara (`poblacionReglas.<tipo>`, D4-03): `clave` es la
 * del manifiesto que los declara. Un tipo sin declaración no los tiene (los fixtures anteriores siguen válidos).
 */
export const ARCHIVOS_DECLARADOS_POR_EL_MANIFIESTO = {
  'poblacion-reglas': { esquema: 'poblacion-reglas', clave: 'poblacionReglas' },
};

/** Archivos de la raíz del catálogo (no por tipo): cada entrada nombra su esquema. */
export const ARCHIVOS_DE_RAIZ = {
  atributos: { esquema: 'atributos' },
  poblacion: { esquema: 'poblacion' },
};
