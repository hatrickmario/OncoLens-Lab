import {
  exigirAtributoDeclarado,
  exigirCondicionBienFormada,
  exigirDestino,
  exigirDestinoExistente,
  exigirClaveUnica,
  exigirEstadoValido,
} from './reglas.mjs';

/**
 * Registro ÚNICO de los archivos por tipo que tienen ítems con destino (L1D-93, RN-29). Cada entrada nombra su
 * esquema (`schemas/<nombre>.schema.json`) y las reglas que se aplican a cada uno de sus ítems. El lector, el
 * compilador de esquemas y el recorrido del validador salen de aquí: un archivo nuevo (reglas de supuestos, US-129) o
 * una regla nueva (`rechazarCamposDePuntaje`, l1d-126) se añaden en este único sitio.
 *
 * Una regla es `(item, contexto) => codigo | null`; `contexto` trae `tipoDeCancer`, `allowlist`, `atributos`, `vocabulario` y
 * `clavesDelTipo`. Todas toleran un ítem sin `destination` (lo señala `exigirDestino`).
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
    reglas: [...REGLAS_DE_DESTINO],
  },
};

/** Nombres de los archivos por tipo, en el orden del registro. */
export const NOMBRES_DE_ARCHIVO = Object.keys(ARCHIVOS_DEL_CATALOGO);
