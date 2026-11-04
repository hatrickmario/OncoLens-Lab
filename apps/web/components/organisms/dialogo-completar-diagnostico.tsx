'use client';

import { useRef } from 'react';
import type { Diagnosis } from '../../../../packages/api-contracts/src/types/clinical-api';
import {
  useAperturaDeRegistroManual,
  type ConfiguracionDeApertura,
} from '../../lib/registro-manual/use-apertura-de-registro-manual';
import { mensajes } from '../../lib/mensajes';
import { AccionDeRegistro } from '../molecules/accion-de-registro';
import { ContenidoDelDiagnostico } from '../molecules/contenido-del-diagnostico';
import { Dialog } from '../ui/dialog';

export interface DialogoCompletarDiagnosticoProps extends Pick<
  ConfiguracionDeApertura,
  'pagina' | 'idDelEncabezado'
> {
  pacienteId: string;
  egresado: boolean;
  /** Diagnóstico vigente de la ficha (de `obtenerFicha`); `null` sin vigente. */
  diagnostico: Diagnosis | null;
  /** Clave de `?item=` de la página; si es un dato del diagnóstico, abre el diálogo con el foco en su campo. */
  item?: string;
  alGuardar?: () => void;
}

/** «Completar diagnóstico a mano» y su diálogo (S5-03 b); el foco vuelve al botón, o al encabezado si lo abrió `?item=`. */
export function DialogoCompletarDiagnostico({
  pacienteId,
  egresado,
  diagnostico,
  pagina,
  item,
  idDelEncabezado,
  alGuardar,
}: DialogoCompletarDiagnosticoProps) {
  const { accion, titulo, descripcion } = mensajes().registroManual.diagnostico;
  const disparador = useRef<HTMLButtonElement>(null);
  const apertura = useAperturaDeRegistroManual({
    pacienteId,
    pagina,
    entidad: 'Diagnosis',
    item,
    idDelEncabezado,
    egresado,
  });
  return (
    <>
      <AccionDeRegistro
        ref={disparador}
        texto={accion}
        egresado={egresado}
        idDeAyuda={`registro-egresado-diagnostico-${idDelEncabezado}`}
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
        <ContenidoDelDiagnostico
          apertura={apertura}
          pacienteId={pacienteId}
          diagnostico={diagnostico}
          alGuardar={() => {
            apertura.refrescar();
            alGuardar?.();
          }}
        />
      </Dialog>
    </>
  );
}
