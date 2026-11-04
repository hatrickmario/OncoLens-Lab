import type { CompletenessItem } from '../../../../packages/api-contracts/src/types/clinical-api';
import { accionManualDe, presentarEstado } from '../../lib/evidence/faltantes';
import { nombreDeOrigen } from '../../lib/ficha/presentacion';
import { AccionDeFaltante } from '../organisms/accion-de-faltante';

/**
 * Una fila de la columna «Datos críticos» (S5-02): símbolo decorativo, etiqueta del catálogo, estado en palabra y, o el
 * origen en texto de un dato presente (sin enlace a documento, D-8), o la acción manual de un faltante.
 */
export function FilaDeDatoCritico({
  item,
  pacienteId,
  conAcciones,
  alGuardar,
}: {
  item: CompletenessItem;
  pacienteId: string;
  /** Falso con el paciente egresado (RN-17): no se ofrece ninguna acción de registro. */
  conAcciones: boolean;
  alGuardar: () => void;
}) {
  const { simbolo, texto } = presentarEstado(item.status);
  const faltante = conAcciones && item.status === 'faltante' ? accionManualDe(item) : null;
  return (
    <li className="border-border flex flex-wrap items-baseline gap-x-2 border-b py-2 last:border-b-0">
      <span aria-hidden="true">{simbolo}</span>
      <span className="font-semibold">{item.label}</span>
      <span>{texto}</span>
      {item.provenance && (
        <span className="text-text-muted text-sm">
          {nombreDeOrigen(item.provenance.entryMethod)}
        </span>
      )}
      {faltante && (
        <AccionDeFaltante
          faltante={faltante}
          etiqueta={item.label}
          pacienteId={pacienteId}
          alGuardar={alGuardar}
        />
      )}
    </li>
  );
}
