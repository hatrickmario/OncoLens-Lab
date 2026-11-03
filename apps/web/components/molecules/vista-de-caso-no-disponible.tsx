import { mensajes } from '../../lib/mensajes';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';

/** Error de carga sin datos parciales ni detalle del servidor (US-090 AC-6): solo el aviso y «Reintentar». */
export function VistaDeCasoNoDisponible({ onReintentar }: { onReintentar: () => void }) {
  const { error } = mensajes().caso;
  return (
    <Alert className="flex flex-wrap items-center justify-between gap-3">
      <p className="m-0 font-semibold">{error.titulo}</p>
      <Button type="button" variante="secundario" onClick={onReintentar}>
        {error.reintentar}
      </Button>
    </Alert>
  );
}
