import { textoDeAviso } from '../../lib/ficha/presentacion';

/**
 * Avisos informativos de la ficha (RN-26): datos por revisar y datos sin verificar. Nunca de error y nunca bloquean
 * el análisis; sin avisos no se pinta nada.
 */
export function PendingReviewNotice({
  porRevisar,
  sinVerificar,
}: {
  porRevisar: number;
  sinVerificar: number;
}) {
  if (porRevisar === 0 && sinVerificar === 0) return null;
  return (
    <div
      role="status"
      className="rounded-control border-warn-border bg-warn-bg text-warn mb-4 border p-3"
    >
      {porRevisar > 0 && <p className="m-0">{textoDeAviso(porRevisar, 'porRevisarUno')}</p>}
      {sinVerificar > 0 && <p className="m-0">{textoDeAviso(sinVerificar, 'sinVerificarUno')}</p>}
    </div>
  );
}
