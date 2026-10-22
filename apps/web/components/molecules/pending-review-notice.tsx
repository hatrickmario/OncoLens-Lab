import { textoDeAviso } from '../../lib/ficha/presentacion';
import { mensajes } from '../../lib/mensajes';

/**
 * Avisos informativos de la ficha (RN-26): datos por revisar, datos sin verificar y tipo de cáncer fuera del alcance
 * del piloto. Nunca de error y nunca bloquean el análisis; sin avisos no se pinta nada.
 */
export function PendingReviewNotice({
  porRevisar,
  sinVerificar,
  fueraDeAlcance,
}: {
  porRevisar: number;
  sinVerificar: number;
  fueraDeAlcance: boolean;
}) {
  if (porRevisar === 0 && sinVerificar === 0 && !fueraDeAlcance) return null;
  return (
    <div
      role="status"
      className="rounded-control border-warn-border bg-warn-bg text-warn mb-4 border p-3"
    >
      {fueraDeAlcance && <p className="m-0">{mensajes().alcance.tipoNoHabilitado}</p>}
      {porRevisar > 0 && <p className="m-0">{textoDeAviso(porRevisar, 'porRevisarUno')}</p>}
      {sinVerificar > 0 && <p className="m-0">{textoDeAviso(sinVerificar, 'sinVerificarUno')}</p>}
    </div>
  );
}
