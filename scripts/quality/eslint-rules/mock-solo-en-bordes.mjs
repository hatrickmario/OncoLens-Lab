// Regla `oncolens/mock-solo-en-bordes` (L1D-285, US-213 AC-10, design D4): CLAUDE.md, «Mocks solo en los bordes arquitectónicos».
// `vi.mock` / `vi.doMock` de un módulo propio (ruta relativa, alias `@/`, `@oncolens/`, `~/`, `src/`) o de la base de datos
// (Prisma, `pg`) esconde la lógica real que el test debería ejercitar. Los paquetes de terceros que son borde (HTTP, SDK de
// MinIO, `next/*`) se permiten. Lo que no se puede verificar (argumento dinámico) se REPORTA: no se deja pasar en silencio.

const LLAMADAS_PROHIBIDAS = new Set(['mock', 'doMock']);
const PREFIJOS_PROPIOS = ['./', '../', '/', '@/', '@oncolens/', '~/', 'src/'];
const PAQUETES_PROHIBIDOS = ['@prisma/client', '@prisma/adapter-pg', '.prisma/client', 'prisma', 'pg'];

const textoLiteral = (nodo) => {
  if (nodo?.type === 'Literal' && typeof nodo.value === 'string') return nodo.value;
  if (nodo?.type === 'TemplateLiteral' && nodo.expressions.length === 0) return nodo.quasis[0].value.cooked;
  return null;
};

/** `vi.mock(import('./x'))` (la forma tipada de Vitest) pide el módulo dentro de un `import()`. */
const moduloPedido = (argumento) =>
  argumento?.type === 'ImportExpression' ? textoLiteral(argumento.source) : textoLiteral(argumento);

const esModuloPropio = (modulo) =>
  PREFIJOS_PROPIOS.some((prefijo) => modulo.startsWith(prefijo)) ||
  PAQUETES_PROHIBIDOS.some((paquete) => modulo === paquete || modulo.startsWith(`${paquete}/`));

const nombreDeMiembro = (miembro) => {
  if (!miembro.computed) return miembro.property.type === 'Identifier' ? miembro.property.name : null;
  return textoLiteral(miembro.property);
};

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      moduloPropio:
        "mock-solo-en-bordes: no mockees '{{modulo}}': es código propio o base de datos. Mock solo en los bordes (HTTP saliente, LLM, MinIO, nube); usa el módulo real y una BD real (CLAUDE.md, Política TDD).",
      noVerificable:
        'mock-solo-en-bordes: el módulo que mockea esta llamada no es un texto literal y no se puede verificar; escríbelo como literal.',
    },
  },
  create(contexto) {
    // `vi` puede importarse con otro nombre (`import { vi as v } from 'vitest'`).
    const nombresDeVi = new Set(['vi']);
    return {
      ImportDeclaration(nodo) {
        if (nodo.source.value !== 'vitest') return;
        for (const especificador of nodo.specifiers) {
          if (especificador.type === 'ImportSpecifier' && especificador.imported.name === 'vi') {
            nombresDeVi.add(especificador.local.name);
          }
        }
      },
      CallExpression(nodo) {
        const { callee } = nodo;
        if (callee.type !== 'MemberExpression' || callee.object.type !== 'Identifier') return;
        if (!nombresDeVi.has(callee.object.name) || !LLAMADAS_PROHIBIDAS.has(nombreDeMiembro(callee))) return;
        const modulo = moduloPedido(nodo.arguments[0]);
        if (modulo === null) contexto.report({ node: nodo, messageId: 'noVerificable' });
        else if (esModuloPropio(modulo)) contexto.report({ node: nodo, messageId: 'moduloPropio', data: { modulo } });
      },
    };
  },
};
