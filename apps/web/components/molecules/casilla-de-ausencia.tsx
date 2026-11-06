'use client';

import { mensajes } from '../../lib/mensajes';
import { Label } from '../ui/label';

/** Casilla «Sin tratamiento previo a la fecha»: cambia el formulario de un tratamiento por la declaración de ausencia. */
export function CasillaDeAusencia({
  marcada,
  alCambiar,
}: {
  marcada: boolean;
  alCambiar: (marcada: boolean) => void;
}) {
  const { declaracion: d } = mensajes().caso.registro.tratamiento;
  return (
    <div className="mb-3">
      <div className="flex min-h-11 items-center gap-2">
        <input
          id="tp-sin-tratamiento"
          type="checkbox"
          checked={marcada}
          aria-describedby="tp-sin-tratamiento-ayuda"
          onChange={(e) => alCambiar(e.target.checked)}
        />
        <Label htmlFor="tp-sin-tratamiento">{d.casilla}</Label>
      </div>
      <p id="tp-sin-tratamiento-ayuda" className="text-text-muted m-0 text-sm">
        {d.ayuda}
      </p>
    </div>
  );
}
