import type { CompletenessItem } from '../../../../packages/api-contracts/src/types/clinical-api';
import { accionManualDe, presentarEstado } from '../../lib/evidence/faltantes';
import { nombreDeOrigen } from '../../lib/ficha/presentacion';
import { mensajes } from '../../lib/mensajes';
import { AccionDeFaltante } from './accion-de-faltante';

/**
 * Una fila de la columna «Datos críticos» (S5-02): símbolo decorativo, etiqueta del catálogo, estado en palabra y, o el
 * origen en texto de un dato presente (sin enlace a documento, D-8), o la acción manual de un faltante.
 */
export function FilaDeDatoCritico({
  item,
  pacienteId,
  egresado,
  alGuardar,
}: {
  item: CompletenessItem;
  pacienteId: string;
  /** Paciente egresado (RN-17): no se ofrece ninguna acción de registro. */
  egresado: boolean;
  alGuardar: () => void;
}) {
  const { simbolo, texto } = presentarEstado(item.status);
  const esPresente =
    item.status === 'presente_verificado' || item.status === 'presente_sin_verificar';
  const faltante = !egresado && item.status === 'faltante' ? accionManualDe(item) : null;
  return (
    <li className="border-border flex flex-wrap items-baseline gap-x-2 border-b py-2 last:border-b-0">
      <span aria-hidden="true">{simbolo}</span>
      <span className="font-semibold">{item.label}</span>
      <span>{texto}</span>
      {esPresente && (
        <span className="text-text-muted text-sm">
          {item.provenance
            ? nombreDeOrigen(item.provenance.entryMethod)
            : mensajes().datosCriticos.origenNoDisponible}
        </span>
      )}
      {faltante && (
        <AccionDeFaltante
          faltante={faltante}
          etiqueta={item.label}
          pacienteId={pacienteId}
          egresado={egresado}
          alGuardar={alGuardar}
        />
      )}
    </li>
  );
}
