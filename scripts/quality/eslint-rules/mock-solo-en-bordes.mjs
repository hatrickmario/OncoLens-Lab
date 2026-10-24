// Regla `oncolens/mock-solo-en-bordes` (L1D-285, US-213 AC-10, design D4): CLAUDE.md, «Mocks solo en los bordes arquitectónicos».
// `vi.mock` / `vi.doMock` de un módulo propio (ruta relativa, alias `@/` o `@oncolens/`) o de Prisma esconde la lógica real
// que el test debería ejercitar. Los paquetes de terceros que son borde (HTTP, SDK de MinIO, `next/*`) se permiten.

const LLAMADAS_PROHIBIDAS = new Set(['mock', 'doMock']);
const PREFIJOS_PROPIOS = ['./', '../', '@/', '@oncolens/'];
const PAQUETES_PROHIBIDOS = ['@prisma/client'];

const esLlamadaDeVi = (nodo) =>
  nodo.callee.type === 'MemberExpression' &&
  nodo.callee.object.type === 'Identifier' &&
  nodo.callee.object.name === 'vi' &&
  nodo.callee.property.type === 'Identifier' &&
  LLAMADAS_PROHIBIDAS.has(nodo.callee.property.name);

/** El módulo mockeado cuando es un texto literal; una expresión dinámica no se puede revisar y se deja pasar. */
const moduloLiteral = (nodo) => {
  const [primero] = nodo.arguments;
  return primero?.type === 'Literal' && typeof primero.value === 'string' ? primero.value : null;
};

const esModuloPropio = (modulo) =>
  PREFIJOS_PROPIOS.some((prefijo) => modulo.startsWith(prefijo)) ||
  PAQUETES_PROHIBIDOS.some((paquete) => modulo === paquete || modulo.startsWith(`${paquete}/`));

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      moduloPropio:
        "mock-solo-en-bordes: no mockees '{{modulo}}': es código propio o Prisma. Mock solo en los bordes (HTTP saliente, LLM, MinIO, nube); usa el módulo real y una BD real (CLAUDE.md, Política TDD).",
    },
  },
  create(contexto) {
    return {
      CallExpression(nodo) {
        if (!esLlamadaDeVi(nodo)) return;
        const modulo = moduloLiteral(nodo);
        if (modulo !== null && esModuloPropio(modulo)) {
          contexto.report({ node: nodo, messageId: 'moduloPropio', data: { modulo } });
        }
      },
    };
  },
};
