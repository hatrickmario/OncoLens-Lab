'use client';

import { useRef } from 'react';
import type { AnclaDeFicha } from '../../lib/ficha/anclas';
import type { PaginaDeRegistro } from '../../lib/registro-manual/enlaces';
import { useAperturaDeRegistroManual } from '../../lib/registro-manual/use-apertura-de-registro-manual';
import { mensajes } from '../../lib/mensajes';
import { AccionDeRegistro } from '../molecules/accion-de-registro';
import { FormularioDeBiomarcador } from '../molecules/formulario-de-biomarcador';
import { Dialog } from '../ui/dialog';

export interface DialogoRegistroBiomarcadorProps {
  pacienteId: string;
  egresado: boolean;
  pagina: PaginaDeRegistro;
  /** Clave de `?item=` de la página; si es un biomarcador del catálogo, abre el diálogo con su término. */
  item?: string;
  /** Id del encabezado de la sección que lo aloja: a donde vuelve el foco si lo abrió la URL. */
  idDelEncabezado: AnclaDeFicha | 'caso-series';
  /** Recarga la vista de caso tras el `201`; la ficha y la barra se refrescan siempre. */
  alGuardar?: () => void;
}

/** «Registrar biomarcador» y su diálogo (S5-03 a); el foco vuelve al botón, o al encabezado si lo abrió `?item=`. */
export function DialogoRegistroBiomarcador({
  pacienteId,
  egresado,
  pagina,
  item,
  idDelEncabezado,
  alGuardar,
}: DialogoRegistroBiomarcadorProps) {
  const { accion, titulo, descripcion } = mensajes().registroManual.biomarcador;
  const disparador = useRef<HTMLButtonElement>(null);
  const apertura = useAperturaDeRegistroManual({
    pacienteId,
    pagina,
    entidad: 'Biomarker',
    item,
    idDelEncabezado,
    egresado,
  });
  const termino = apertura.deLaUrl?.entidad === 'Biomarker' ? apertura.deLaUrl.termino : undefined;
  return (
    <>
      <AccionDeRegistro
        ref={disparador}
        texto={accion}
        egresado={egresado}
        idDeAyuda={`registro-egresado-biomarcador-${idDelEncabezado}`}
        alAbrir={() => apertura.abrir(disparador.current)}
      />
      <Dialog
        abierto={apertura.abierto}
        alCambiar={(abierto) => {
          if (!abierto) apertura.cerrar();
        }}
        titulo={titulo}
        descripcion={descripcion}
        retornoDeFoco={apertura.retornoDeFoco}
      >
        <FormularioDeBiomarcador
          pacienteId={pacienteId}
          lectura={apertura.lectura}
          terminoInicial={termino}
          alGuardar={() => {
            apertura.refrescar();
            alGuardar?.();
          }}
          alCerrar={apertura.cerrar}
        />
      </Dialog>
    </>
  );
}
