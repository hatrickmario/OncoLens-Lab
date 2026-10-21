/**
 * Regla de privacidad compartida (RN-10): un nombre de propiedad desconocida solo se imprime si parece un identificador de
 * campo; cualquier otra cosa podría ser un dato. La usan el verificador de respuestas y los refinamientos generados.
 */
export const NOMBRE_DE_CAMPO = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** Lo que se imprime en lugar de un nombre de propiedad que no parece un identificador de campo. */
export const PROPIEDAD_NO_DECLARADA = '{propiedad no declarada}';
