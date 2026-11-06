// Sin `server-only`: lo comparten el proxy, el layout, el componente cliente de estilos y los tests (US-216).

/** Cabecera de request con la que el proxy pasa el nonce al layout. */
export const CABECERA_NONCE = 'x-nonce';

/** Nombre del `<meta>` con el que el layout publica el nonce para los estilos que inyectan los diálogos de Radix. */
export const META_NONCE = 'csp-nonce';
