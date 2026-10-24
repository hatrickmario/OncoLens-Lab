// Regla `oncolens/tests-sin-desactivar` (L1D-285, US-213 AC-8): completa a `vitest/no-focused-tests` y
// `vitest/no-disabled-tests`, que no ven `it.todo(...)` (un test sin cuerpo que nunca falla) ni `fit` / `fdescribe`
// (el foco de Jest). Mismo id que la regla de Python (`check-pytest-hygiene.py`) para que el reporte hable un solo idioma.

const SUITES = new Set(['it', 'test', 'describe', 'suite']);
const FOCOS_DE_JEST = new Set(['fit', 'fdescribe', 'ftest']);

const esPendiente = (llamada) =>
  llamada.type === 'MemberExpression' &&
  llamada.object.type === 'Identifier' &&
  SUITES.has(llamada.object.name) &&
  llamada.property.type === 'Identifier' &&
  llamada.property.name === 'todo';

const esFocoDeJest = (llamada) => llamada.type === 'Identifier' && FOCOS_DE_JEST.has(llamada.name);

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      pendiente:
        "tests-sin-desactivar: '{{llamada}}.todo' deja un test sin cuerpo que nunca falla; escribe el test (en rojo) o quítalo con el trailer Test-Removal.",
      foco: "tests-sin-desactivar: '{{llamada}}' enfoca el test y el resto de la suite deja de correr.",
    },
  },
  create(contexto) {
    return {
      CallExpression(nodo) {
        if (esPendiente(nodo.callee)) {
          contexto.report({ node: nodo, messageId: 'pendiente', data: { llamada: nodo.callee.object.name } });
        } else if (esFocoDeJest(nodo.callee)) {
          contexto.report({ node: nodo, messageId: 'foco', data: { llamada: nodo.callee.name } });
        }
      },
    };
  },
};
