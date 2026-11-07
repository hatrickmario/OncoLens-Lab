import type { ReactNode } from 'react';
import type { ChatBlock } from '../../../../packages/api-contracts/src/types/clinical-api';
import { grupoDelBloque, type GrupoDeBloque } from '../../lib/conversacion/rotulo-de-bloque';
import { mensajes } from '../../lib/mensajes';
import { MarkdownSeguro } from '../atoms/markdown-seguro';

const ESTILOS: Readonly<Record<GrupoDeBloque, string>> = {
  clinico: 'border-clinical bg-clinical-bg',
  evidencia: 'border-evidence bg-evidence-bg',
  interpretacion: 'border-control-border bg-surface',
  alcance: 'border-control-border bg-surface-alt',
  adicional: 'border-control-border bg-surface-alt',
};

const COLOR_DEL_ROTULO: Readonly<Record<GrupoDeBloque, string>> = {
  clinico: 'text-clinical',
  evidencia: 'text-evidence',
  interpretacion: 'text-text',
  alcance: 'text-text-muted',
  adicional: 'text-text-muted',
};

export interface ConversationBlockProps {
  bloque: ChatBlock;
  /** Chips «Ver en el caso» y citas ya resueltos por la tarjeta: el bloque solo los coloca. */
  children?: ReactNode;
}

/**
 * Un bloque del turno: rótulo con símbolo y texto (el color nunca es la única señal) y su texto como Markdown seguro.
 * `interpretacion` lleva su propio rótulo y no entra en el grupo clínico (RN-19, RN-01).
 */
export function ConversationBlock({ bloque, children }: ConversationBlockProps) {
  const grupo = grupoDelBloque(bloque.kind);
  const rotulo = mensajes().conversacion.rotulos[grupo];
  return (
    <section
      data-grupo={grupo}
      className={`rounded-tarjeta mt-2 border-l-4 p-3 ${ESTILOS[grupo]}`}
    >
      <p className={`m-0 text-sm font-semibold ${COLOR_DEL_ROTULO[grupo]}`}>{rotulo}</p>
      <MarkdownSeguro texto={bloque.text} />
      {children}
    </section>
  );
}
