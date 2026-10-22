'use client';

import { useRef, type KeyboardEvent } from 'react';
import type { TextosDePacientes } from '../../lib/pacientes/consulta';
import { cn } from '../../lib/utils';

export type ModoDeBusqueda = 'documento' | 'nombre';

const MODOS: readonly ModoDeBusqueda[] = ['documento', 'nombre'];

export const ID_PANEL_DE_BUSQUEDA = 'panel-de-busqueda';

export interface PestanasDeBusquedaProps {
  modo: ModoDeBusqueda;
  onCambiar: (modo: ModoDeBusqueda) => void;
  textos: TextosDePacientes['busqueda'];
}

/** Siguiente pestaña según la tecla del patrón ARIA de pestañas (flechas, Inicio y Fin); otra tecla no mueve. */
function destinoDeLaTecla(evento: KeyboardEvent, actual: number): number | null {
  const tecla = evento.key;
  if (evento.altKey || evento.ctrlKey || evento.metaKey) return null;
  const ultima = MODOS.length - 1;
  if (tecla === 'ArrowRight') return actual === ultima ? 0 : actual + 1;
  if (tecla === 'ArrowLeft') return actual === 0 ? ultima : actual - 1;
  if (tecla === 'Home') return 0;
  return tecla === 'End' ? ultima : null;
}

/** Patrón ARIA de pestañas con foco itinerante: solo la pestaña vigente entra en el orden de tabulación. */
export function PestanasDeBusqueda({ modo, onCambiar, textos }: PestanasDeBusquedaProps) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const nombres = { documento: textos.porDocumento, nombre: textos.porNombre };

  function alPulsar(evento: KeyboardEvent, indice: number) {
    const destino = destinoDeLaTecla(evento, indice);
    if (destino === null) return;
    evento.preventDefault();
    onCambiar(MODOS[destino]!);
    botones.current[destino]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={textos.modos}
      className="border-border mb-3 flex gap-1 border-b"
    >
      {MODOS.map((valor, indice) => (
        <button
          key={valor}
          ref={(boton) => {
            botones.current[indice] = boton;
          }}
          type="button"
          role="tab"
          id={`pestana-${valor}`}
          aria-selected={valor === modo}
          aria-controls={valor === modo ? ID_PANEL_DE_BUSQUEDA : undefined}
          tabIndex={valor === modo ? 0 : -1}
          onClick={() => onCambiar(valor)}
          onKeyDown={(evento) => alPulsar(evento, indice)}
          className={cn(
            'min-h-11 cursor-pointer border-b-2 border-transparent bg-transparent px-4 font-semibold',
            valor === modo && 'border-primary text-primary',
          )}
        >
          {nombres[valor]}
        </button>
      ))}
    </div>
  );
}
