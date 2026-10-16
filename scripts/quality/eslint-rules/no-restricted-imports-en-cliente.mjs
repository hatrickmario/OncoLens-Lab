import { builtinRules } from 'eslint/use-at-your-own-risk';

const MENSAJE =
  "Un módulo 'use client' no puede importar código del servidor (lib/server/**, server-only)";

const opciones = {
  patterns: [{ group: ['**/lib/server/**', '@/lib/server/**', 'server-only'], message: MENSAJE }],
};

const esDirectivaCliente = (nodo) =>
  nodo.type === 'ExpressionStatement' && nodo.directive === 'use client';

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
    return builtinRules.get('no-restricted-imports').create(contextoConOpciones);
  },
};
