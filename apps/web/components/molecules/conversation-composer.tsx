'use client';

import { ComposerPrimitive } from '@assistant-ui/react';
import { mensajes } from '../../lib/mensajes';

/** Campo de pregunta con `<label>` visible; Enter envía. Con `deshabilitado` (RN-15, opt-out o envío en curso) no envía. */
export function ConversationComposer({ deshabilitado }: { deshabilitado: boolean }) {
  const { campo, preguntar } = mensajes().conversacion;
  return (
    <ComposerPrimitive.Root className="mt-3 flex flex-col gap-2">
      <label htmlFor="pregunta-del-chat" className="font-semibold">
        {campo}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <ComposerPrimitive.Input
          id="pregunta-del-chat"
          rows={2}
          disabled={deshabilitado}
          className="border-control-border rounded-control bg-surface min-h-11 flex-1 border p-2"
        />
        <ComposerPrimitive.Send
          disabled={deshabilitado}
          className="bg-primary rounded-control min-h-11 cursor-pointer px-4 text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {preguntar}
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}
