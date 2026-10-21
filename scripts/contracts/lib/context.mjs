/** Contexto que reciben las reglas: specs (crudos y empaquetados), ejemplos y documentos. Sin E/S de archivos. */
import { BaseResolver, Source, bundleDocument, detectSpec, getTypes, loadConfig } from '@redocly/openapi-core';
import YAML from 'yaml';
import { REDOCLY_CONFIG } from './paths.mjs';
import { EVIDENCE, PROVIDERS } from './specs.mjs';
import { walkJson } from './walk.mjs';

/**
 * @typedef {{ file: string, raw: any | null, error?: string }} SpecInput
 * @typedef {SpecInput & { bundled: any | null, externalRefs?: { pointer: string, ref: string }[] }} SpecEntry
 */

/** Raíz virtual: el empaquetado resuelve las `$ref` entre documentos en memoria, nunca contra el disco. */
const RAIZ_VIRTUAL = '/contratos-en-memoria';

/** Resolutor que solo conoce los documentos que se le dan: cualquier otra `$ref` externa queda sin resolver. */
class ResolutorEnMemoria extends BaseResolver {
  constructor(documentos) {
    super();
    for (const documento of documentos) this.cache.set(documento.source.absoluteRef, Promise.resolve(documento));
  }

  async loadExternalRef(absoluteRef) {
    throw new Error(`${absoluteRef} no es un documento del contrato`);
  }
}

/** Copia del documento para Redocly, que muta el árbol al empaquetar. */
const documentoEnMemoria = (file, raw) => ({
  source: new Source(`${RAIZ_VIRTUAL}/${file}`, YAML.stringify(raw)),
  parsed: structuredClone(raw),
});

let configuracion;
const cargarConfiguracion = () => (configuracion ??= loadConfig({ configPath: REDOCLY_CONFIG }));

/** Las `$ref` externas (no empiezan por `#`) que quedan en el spec empaquetado, con el puntero del objeto que las declara. */
function referenciasExternasSinResolver(empaquetado) {
  return [...walkJson(empaquetado)]
    .filter(({ key, value }) => key === '$ref' && typeof value === 'string' && !value.startsWith('#'))
    .map(({ pointer, value }) => ({ pointer: pointer.replace(/\/\$ref$/, ''), ref: value }));
}

/** Nombres de schema que Redocly renombró con sufijo de colisión (`Nombre-2`): los de origen no los traen. */
function schemasRepetidos(empaquetado, ...origenes) {
  const nombresDeOrigen = new Set(origenes.flatMap((spec) => Object.keys(spec?.components?.schemas ?? {})));
  return Object.keys(empaquetado.components?.schemas ?? {})
    .filter((nombre) => !nombresDeOrigen.has(nombre))
    .map((nombre) => nombre.replace(/-\d+$/, ''));
}

/**
 * Falla cerrado tras empaquetar (design.md D2): una `$ref` externa sin resolver o un nombre de schema repetido
 * invalidan el spec. @returns {{ externalRefs: { pointer: string, ref: string }[], error?: string }}
 */
function verificarEmpaquetadoCerrado(file, empaquetado, raw, evidence) {
  const externalRefs = referenciasExternasSinResolver(empaquetado);
  const errores = [
    ...externalRefs.map(({ pointer, ref }) => `${file}: ${pointer}: $ref externa sin resolver ${ref}`),
    ...new Set(schemasRepetidos(empaquetado, raw, evidence).map((nombre) => `${file}: schema repetido ${nombre}`)),
  ];
  return errores.length === 0 ? { externalRefs } : { externalRefs, error: errores.join('; ') };
}

async function empaquetarProveedor({ file, raw }, evidence, config) {
  const document = documentoEnMemoria(file, raw);
  const { bundle } = await bundleDocument({
    document,
    config,
    types: getTypes(detectSpec(document.parsed)),
    externalRefResolver: new ResolutorEnMemoria([documentoEnMemoria(evidence.file, evidence.raw)]),
  });
  return { empaquetado: bundle.parsed, ...verificarEmpaquetadoCerrado(file, bundle.parsed, raw, evidence.raw) };
}

/** La entrada del proveedor con su versión empaquetada; sin spec que leer, queda sin empaquetar y sin error propio. */
async function entradaEmpaquetada(spec, evidence, config) {
  if (!spec.raw) return { ...spec, bundled: null, externalRefs: [] };
  const { empaquetado, externalRefs, error } = await empaquetarProveedor(spec, evidence, config);
  return { ...spec, bundled: error ? null : empaquetado, externalRefs, ...(error ? { error } : {}) };
}

/**
 * Añade a cada spec su versión empaquetada en memoria con `bundleDocument` de Redocly (los schemas compartidos ya
 * definidos en su `components.schemas`); el archivo compartido se empaqueta a sí mismo. Si el empaquetado no queda
 * cerrado, el spec no tiene versión empaquetada: lleva el error y las `$ref` (las reporta assertSharedSchemasSingleOrigin).
 * @param {{ [name: string]: SpecInput }} specs
 * @returns {Promise<{ [name: string]: SpecEntry }>}
 */
export async function bundleSpecs(specs) {
  const evidence = specs[EVIDENCE];
  const config = await cargarConfiguracion();
  const bundled = { [EVIDENCE]: { ...evidence, bundled: evidence.raw } };
  for (const name of PROVIDERS) bundled[name] = await entradaEmpaquetada(specs[name], evidence, config);
  return bundled;
}

/**
 * Contexto de las reglas.
 * @param {{ specs: { [name: string]: SpecInput }, examples: any, docs: any }} parts
 */
export async function buildContext({ specs, examples, docs }) {
  return { specs: await bundleSpecs(specs), examples, docs };
}
