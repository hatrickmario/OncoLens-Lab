import type { Provenance } from '../../../../packages/api-contracts/src/types/clinical-api';
import { textoDeConfianza, textoDeOrigen } from '../../lib/ficha/presentacion';

/**
 * Origen, revisión y confianza de un dato del paciente en texto (D3), con los mismos textos de la ficha.
 * No recibe ni usa el id del documento de origen (D8). Los eventos de IA usan `ProcedenciaDelEvento`.
 */
export function ProcedenciaDelDato({ procedencia }: { procedencia: Provenance }) {
  return (
    <span className="text-text-muted text-sm">
      {textoDeOrigen(procedencia)} · {textoDeConfianza(procedencia.extractionConfidence)}
    </span>
  );
}
