// Regla `oncolens/tests-sin-desactivar` (L1D-285, US-213 AC-8): completa a `vitest/no-focused-tests` y
// `vitest/no-disabled-tests`, que no ven `it.todo(...)` (un test sin cuerpo que nunca falla), los saltos condicionales
// (`skipIf`, `runIf`), las cadenas (`it.each([...]).todo`, `test.concurrent.todo`, `it['todo']`), el salto desde el contexto del
// test (`({ skip }) => skip()`, `ctx.skip()`) ni `fit` / `fdescribe` (el foco de Jest). Mismo id que la regla de Python
// (`check-pytest-hygiene.py`) para que el reporte hable un solo idioma.

const SUITES = new Set(['it', 'test', 'describe', 'suite', 'bench']);
const FOCOS_DE_JEST = new Set(['fit', 'fdescribe', 'ftest']);
const PROPIEDADES_PENDIENTES = new Set(['todo']);
const PROPIEDADES_CONDICIONALES = new Set(['skipIf', 'runIf']);

const nombreDePropiedad = (miembro) => {
  if (!miembro.computed) return miembro.property.type === 'Identifier' ? miembro.property.name : null;
  const propiedad = miembro.property;
  if (propiedad.type === 'Literal') return String(propiedad.value);
  return propiedad.type === 'TemplateLiteral' && propiedad.expressions.length === 0 ? propiedad.quasis[0].value.cooked : null;
};

/** Recorre `it.each([..]).concurrent.todo` hasta su raíz: el identificador inicial y las propiedades encadenadas. */
function cadenaDe(llamada) {
  const propiedades = [];
  let nodo = llamada;
  while (nodo) {
    if (nodo.type === 'MemberExpression') {
      propiedades.push(nombreDePropiedad(nodo));
      nodo = nodo.object;
    } else if (nodo.type === 'CallExpression') {
      nodo = nodo.callee;
    } else {
      break;
    }
  }
  return { raiz: nodo?.type === 'Identifier' ? nodo.name : null, nodoRaiz: nodo, propiedades };
}

/** Qué mensaje corresponde a la llamada, o null si es un test normal. */
function motivoDe({ raiz, propiedades }) {
  if (raiz === null) return null;
  if (SUITES.has(raiz)) {
    if (propiedades.some((propiedad) => PROPIEDADES_PENDIENTES.has(propiedad))) return 'pendiente';
    if (propiedades.some((propiedad) => PROPIEDADES_CONDICIONALES.has(propiedad))) return 'condicional';
    return null;
  }
  if (propiedades.length === 0) return FOCOS_DE_JEST.has(raiz) ? 'foco' : raiz === 'skip' ? 'saltoDeContexto' : null;
  return propiedades.length === 1 && propiedades[0] === 'skip' ? 'saltoDeContexto' : null;
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      pendiente:
        "tests-sin-desactivar: '{{llamada}}' (todo) deja un test sin cuerpo que nunca falla; escribe el test (en rojo) o quítalo con el trailer Test-Removal.",
      condicional:
        "tests-sin-desactivar: '{{llamada}}' (skipIf/runIf) desactiva el test según una condición; un test se ejecuta siempre o se arregla.",
      foco: "tests-sin-desactivar: '{{llamada}}' enfoca el test y el resto de la suite deja de correr.",
      saltoDeContexto:
        "tests-sin-desactivar: '{{llamada}}' salta el test desde su cuerpo; un test se ejecuta siempre o se arregla.",
    },
  },
  create(contexto) {
    // `it.skipIf(c)('x', fn)` son dos llamadas con la misma raíz: se informa una sola vez por raíz.
    const informadas = new Set();
    return {
      CallExpression(nodo) {
        const cadena = cadenaDe(nodo.callee);
        const motivo = motivoDe(cadena);
        if (!motivo || informadas.has(cadena.nodoRaiz)) return;
        informadas.add(cadena.nodoRaiz);
        contexto.report({ node: nodo, messageId: motivo, data: { llamada: cadena.raiz } });
      },
    };
  },
};
