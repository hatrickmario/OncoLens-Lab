import type { Provenance } from '../../../../packages/api-contracts/src/types/clinical-api';
import { textoDeConfianza, textoDeOrigen } from '../../lib/ficha/presentacion';
import { mensajes } from '../../lib/mensajes';

/**
 * Origen, revisión y confianza de un dato en texto (D3), con los mismos textos de la ficha. Un evento de IA lleva solo
 * «Generado por IA · Sin verificar»: sin confianza de extracción ni «Registro manual» (D9, RN-19, RN-24).
 * No recibe ni usa el id del documento de origen (D8).
 */
export function ProcedenciaDelDato({
  procedencia,
  esDeIa = false,
}: {
  procedencia: Provenance;
  esDeIa?: boolean;
}) {
  if (esDeIa) {
    return <span className="text-text-muted text-sm">{mensajes().caso.origenIa}</span>;
  }
  return (
    <span className="text-text-muted text-sm">
      {textoDeOrigen(procedencia)} · {textoDeConfianza(procedencia.extractionConfidence)}
    </span>
  );
}
