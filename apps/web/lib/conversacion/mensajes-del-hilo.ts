import type { AppendMessage, ThreadMessageLike } from '@assistant-ui/react';
import type { ElementoDelHilo } from './use-conversacion';

/** Nombre del *data part* con el que el turno completo viaja por el hilo de assistant-ui (uno por turno, sin tokens parciales). */
export const PARTE_DEL_TURNO = 'turno';

/** Pregunta del oncólogo → mensaje `user`; turno del asistente → mensaje `assistant` con una sola parte de datos. */
export function mensajesDelHilo(elementos: readonly ElementoDelHilo[]): ThreadMessageLike[] {
  return elementos.map((elemento): ThreadMessageLike =>
    elemento.tipo === 'pregunta'
      ? { id: elemento.id, role: 'user', content: [{ type: 'text', text: elemento.texto }] }
      : {
          id: elemento.turno.id,
          role: 'assistant',
          content: [{ type: 'data', name: PARTE_DEL_TURNO, data: elemento.turno }],
        },
  );
}

/** El texto que el composer entrega a `onNew`: la primera parte de texto del mensaje, o vacío. */
export function textoDelMensaje(mensaje: AppendMessage): string {
  const parte = mensaje.content.find((contenido) => contenido.type === 'text');
  return parte?.type === 'text' ? parte.text : '';
}
