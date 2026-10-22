import type { DataOrigin } from '../../../../packages/api-contracts/src/types/clinical-api';
import type { TextosDePacientes } from '../../lib/pacientes/consulta';
import { cn } from '../../lib/utils';

const ESTILOS: Record<DataOrigin, string> = {
  sintetico: 'bg-status-desconocido-bg text-status-desconocido',
  real_anonimizado: 'bg-warn-bg text-warn border-warn-border',
  real_identificado: 'bg-warn-bg text-warn border-warn-border',
};

/** Origen del dato como texto (nunca solo color): "SINTÉTICO" en el seed, "REAL …" con datos reales. */
export function EtiquetaDeOrigen({
  origen,
  textos,
}: {
  origen: DataOrigin;
  textos: TextosDePacientes;
}) {
  return (
    <span
      className={cn(
        'rounded-etiqueta border-border inline-block border px-2 text-xs font-semibold',
        ESTILOS[origen],
      )}
    >
      {textos.origenes[origen]}
    </span>
  );
}
