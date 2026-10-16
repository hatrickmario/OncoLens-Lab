/**
 * Detecta, con el AST de TypeScript, listas literales que repiten nombres de identidad o rutas que ya viven en
 * `lib/identity.mjs` y `lib/paths.mjs` (Pre-S1-cierre P-8): una regla debe importarlos, no copiarlos.
 */
import ts from 'typescript';
import { IDENTIDAD_PII, matchesIdentity } from '../../lib/identity.mjs';
import { PATHS, typesPath } from '../../lib/paths.mjs';
import { PROVIDERS } from '../../lib/specs.mjs';

const RUTAS_CONOCIDAS = new Set([
  ...Object.values(PATHS.specs),
  ...PROVIDERS.map((proveedor) => typesPath(proveedor)),
  PATHS.examplesDir,
  PATHS.dataModel,
  PATHS.readme,
  PATHS.prohibitedTerms,
]);
const PATRONES_DE_IDENTIDAD = new Set(IDENTIDAD_PII.map((patron) => patron.toString()));

const esCadena = (nodo) => ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo);

/** Por cada array literal del archivo, los elementos que duplican una fuente única, con su línea. */
export function duplicadosEnListasLiterales(codigo, nombreDeArchivo = 'regla.mjs') {
  const archivo = ts.createSourceFile(nombreDeArchivo, codigo, ts.ScriptTarget.Latest, true);
  const duplicados = [];
  const visitar = (nodo) => {
    if (ts.isArrayLiteralExpression(nodo)) {
      for (const elemento of nodo.elements) {
        const motivo = motivoDeDuplicado(elemento);
        if (motivo) duplicados.push({ elemento: elemento.getText(archivo), motivo, linea: archivo.getLineAndCharacterOfPosition(elemento.getStart()).line + 1 });
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return duplicados;
}

function motivoDeDuplicado(elemento) {
  if (esCadena(elemento) && matchesIdentity(elemento.text, IDENTIDAD_PII)) return 'nombre de identidad: importar lib/identity.mjs';
  if (esCadena(elemento) && RUTAS_CONOCIDAS.has(elemento.text)) return 'ruta conocida: importar lib/paths.mjs';
  if (ts.isRegularExpressionLiteral(elemento) && PATRONES_DE_IDENTIDAD.has(elemento.text)) return 'patrón de identidad: importar lib/identity.mjs';
  return null;
}
