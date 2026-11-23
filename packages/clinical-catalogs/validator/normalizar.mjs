/**
 * Normalización de texto del validador: la misma que `normalizar_texto` de `rag-orchestrator` (NFKD sin marcas Mn,
 * minúsculas y todo lo que no es letra ni dígito pasa a espacio, con espacios colapsados). Un único dueño en el
 * runtime del validador (`plantillas.mjs` y `sinonimos.mjs` la comparten): si difiere de la de Python, el validador deja
 * pasar textos que Python une en silencio (RN-27).
 */
export const normalizar = (texto) =>
  texto
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
