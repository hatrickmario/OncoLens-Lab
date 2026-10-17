export interface MensajeAplanado {
  /** Ruta con puntos hasta el valor (`login.titulo`, `evidence.orderCriterion.relevance`). */
  clave: string;
  texto: string;
}

/** Aplana un archivo de mensajes de UI anidado en pares clave con puntos → texto; ignora lo que no es cadena. */
export function aplanarMensajes(mensajes: unknown, prefijo = ''): MensajeAplanado[] {
  if (typeof mensajes === 'string') return [{ clave: prefijo, texto: mensajes }];
  if (mensajes === null || typeof mensajes !== 'object') return [];
  return Object.entries(mensajes).flatMap(([nombre, valor]) =>
    aplanarMensajes(valor, prefijo === '' ? nombre : `${prefijo}.${nombre}`),
  );
}
