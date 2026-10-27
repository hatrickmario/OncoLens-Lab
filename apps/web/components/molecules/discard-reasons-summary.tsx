import type { MotivoResumido } from '../../lib/evidence/resumir-motivos';
import { mensajes } from '../../lib/mensajes';

export interface DiscardReasonsSummaryProps {
  motivos: MotivoResumido[];
}

/**
 * Resumen por motivo de las descartadas, bajo el titular (US-237). Solo texto con las etiquetas existentes:
 * sin recuento si hay un único motivo, sin identificadores de fragmento.
 */
export function DiscardReasonsSummary({ motivos }: DiscardReasonsSummaryProps) {
  const { discarded, discardReason } = mensajes().evidence;
  return (
    <div>
      <p>{discarded.motivos}</p>
      <ul>
        {motivos.map(({ motivo, n }) => (
          <li key={motivo}>
            {motivos.length > 1 ? `${n} × ` : ''}
            {discardReason[motivo]}
          </li>
        ))}
      </ul>
    </div>
  );
}
