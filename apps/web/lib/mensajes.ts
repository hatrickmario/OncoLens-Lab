import es from '../messages/es.json';

/**
 * Textos de la interfaz (design D10): un objeto por espacio de nombres, solo texto plano.
 * Sin librería de i18n mientras haya un único idioma. Los textos obligatorios (RN-19) salen de aquí.
 */
export type Mensajes = typeof es;

export function mensajes(): Mensajes {
  return es;
}
