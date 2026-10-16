import { builtinRules } from 'eslint/use-at-your-own-risk';

const MENSAJE =
  "Un módulo 'use client' no puede importar código del servidor (lib/server/**, server-only)";

const opciones = {
  patterns: [
    {
      group: [
        '**/lib/server',
        '**/lib/server/**',
        '@/lib/server',
        '@/lib/server/**',
        './server/**',
        'server-only',
      ],
      message: MENSAJE,
    },
  ],
};

const esDirectivaCliente = (nodo) =>
  nodo.type === 'ExpressionStatement' && nodo.directive === 'use client';

const esTextoLiteral = (nodo) => nodo?.type === 'Literal' && typeof nodo.value === 'string';

const esRequire = (nodo) => nodo.callee.type === 'Identifier' && nodo.callee.name === 'require';

/**
 * La regla nativa solo revisa `import`/`export … from`. Para `import()` y `require()` se le presenta el
 * módulo pedido como si fuera una declaración de import, con la posición de la llamada.
 */
const comoImport = (nodo, fuente) => ({
  type: 'ImportDeclaration',
  source: fuente,
  specifiers: [],
  loc: nodo.loc,
  range: nodo.range,
  parent: nodo.parent,
});

/** Aplica `no-restricted-imports` solo a los módulos que empiezan con la directiva 'use client'. */
export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: { ...builtinRules.get('no-restricted-imports').meta.messages },
    docs: { description: "Prohíbe importar código del servidor en módulos 'use client'" },
  },
  create(context) {
    if (!context.sourceCode.ast.body.some(esDirectivaCliente)) return {};
    const contextoConOpciones = Object.create(context, { options: { value: [opciones] } });
    const nativa = builtinRules.get('no-restricted-imports').create(contextoConOpciones);

    return {
      ...nativa,
      ImportExpression(nodo) {
        if (esTextoLiteral(nodo.source)) nativa.ImportDeclaration(comoImport(nodo, nodo.source));
      },
      CallExpression(nodo) {
        if (esRequire(nodo) && esTextoLiteral(nodo.arguments[0])) {
          nativa.ImportDeclaration(comoImport(nodo, nodo.arguments[0]));
        }
      },
    };
  },
};
