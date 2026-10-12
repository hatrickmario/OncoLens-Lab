/**
 * Hallazgo de una regla de contratos: dónde está (archivo y ruta JSON), qué regla lo detecta,
 * a qué AC o RN responde y qué hay que corregir.
 * @typedef {{ file: string, path: string, rule: string, ref: string, message: string }} Finding
 */

/**
 * @param {string} file archivo afectado (ruta relativa a la raíz del repositorio)
 * @param {string} path ruta JSON del hallazgo dentro del archivo (`#/…`) o una descripción corta
 * @param {string} rule nombre de la regla que lo detecta
 * @param {string} ref AC o RN que la regla protege
 * @param {string} message qué está mal, en una frase
 * @returns {Finding}
 */
export function finding(file, path, rule, ref, message) {
  return { file, path, rule, ref, message };
}

/**
 * Atajo para las reglas: fija la regla y el AC/RN una vez y devuelve `(file, path, message) → Finding`.
 * @param {string} rule
 * @param {string} ref
 */
export function reporter(rule, ref) {
  return (file, path, message) => finding(file, path, rule, ref, message);
}

/** Una línea por hallazgo: `ARCHIVO:ruta — regla — AC/RN — mensaje`. */
export function formatFinding(item) {
  return `${item.file}:${item.path} — ${item.rule} — ${item.ref} — ${item.message}`;
}
