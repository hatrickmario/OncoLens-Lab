/**
 * Validador de `test/fixtures/temas-del-caso.json` (L1D-329, ADR-52): el fixture compartido caso -> tema de
 * `rag-orchestrator` (`terminos_del_caso`) y del panel conversacional (preguntas guiadas). Reglas con nombre; la forma
 * la comprueba el esquema `temas-del-caso.schema.json`, que solo entra si ellas callan:
 *
 * - `entrada_incompleta`: un caso sin `patientSummary` o sin `clinicalContext`;
 * - `termino_fuera_del_catalogo`: un término esperado que el catálogo versionado no contiene (RN-27).
 *
 * Cada violación nombra el caso (`id`), nunca el término ni su valor: `{ codigo, archivo: 'temas-del-caso', elemento }`.
 */

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const lista = (valor) => (Array.isArray(valor) ? valor.filter(esObjeto) : []);
const textos = (valores) =>
  Array.isArray(valores) ? valores.filter((v) => typeof v === 'string') : [];

/**
 * Todas las cadenas que el catálogo ofrece como término de consulta: etiquetas de `codigos.json`, valores de estadio,
 * de gradación y de biomarcador de `escalas.json` y nombres canónicos de biomarcador de `datos-criticos.json`.
 *
 * @param {{ escalas: object, tipos: Record<string, { codigos: object, 'datos-criticos': object }> }} catalogo
 */
export function terminosDelCatalogo(catalogo) {
  const delosTipos = Object.values(catalogo.tipos ?? {}).flatMap((archivos) => [
    ...lista(archivos.codigos?.entradas).flatMap((e) => textos([e.etiquetaEs, e.terminoCanonico])),
    ...lista(archivos['datos-criticos']?.items).flatMap((item) =>
      textos([item.destination?.match?.name]),
    ),
  ]);
  const escalas = catalogo.escalas ?? {};
  const delasEscalas = [
    ...lista(escalas.sistemasDeEstadificacion),
    ...lista(escalas.sistemasDeGradacion),
    ...lista(escalas.valoresDeBiomarcador),
  ].flatMap((sistema) => textos(sistema.valores));
  return new Set([...delosTipos, ...delasEscalas]);
}

/** @returns {{ codigo: string, archivo: string, elemento: string }[]} */
export function violacionesDeTemasDelCaso(fixture, catalogo) {
  const conocidos = terminosDelCatalogo(catalogo);
  return lista(fixture?.casos).flatMap((caso) => {
    const violacion = (codigo) => ({
      codigo,
      archivo: 'temas-del-caso',
      elemento: String(caso.id),
    });
    if (!esObjeto(caso.patientSummary) || !esObjeto(caso.clinicalContext)) {
      return [violacion('entrada_incompleta')];
    }
    return textos(caso.salida?.terminos).some((termino) => !conocidos.has(termino))
      ? [violacion('termino_fuera_del_catalogo')]
      : [];
  });
}
