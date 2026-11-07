'use client';

import type { RefObject } from 'react';
import type { PanelLateral } from '../../lib/conversacion/panel-lateral';
import { mensajes } from '../../lib/mensajes';
import { DatoDelPacienteEnPanel } from '../molecules/dato-del-paciente-en-panel';
import { FragmentoCitadoEnPanel } from '../molecules/fragmento-citado-en-panel';
import { Sheet } from '../ui/sheet';

export interface PanelLateralDelChatProps {
  /** Qué abrir; `null` con el panel cerrado. */
  panel: PanelLateral | null;
  patientId: string;
  alCerrar: () => void;
  /** Botón que abrió el panel: recibe el foco al cerrarse. */
  retornoDeFoco: RefObject<HTMLElement | null>;
}

/**
 * Un solo panel lateral para todo el chat (design D1): lo controla el padre del hilo, así abrirlo no toca los turnos,
 * el borrador ni el *scroll*. Decide su contenido por el tipo de panel: fragmento citado o dato del paciente.
 */
export function PanelLateralDelChat({
  panel,
  patientId,
  alCerrar,
  retornoDeFoco,
}: PanelLateralDelChatProps) {
  const { panel: textos } = mensajes().conversacion;
  const esDato = panel?.tipo === 'dato';
  return (
    <Sheet
      abierto={panel !== null}
      alCambiar={(abierto) => !abierto && alCerrar()}
      titulo={esDato ? textos.tituloDato : textos.tituloCita}
      descripcion={esDato ? textos.descripcionDato : textos.descripcionCita}
      cerrar={textos.cerrar}
      retornoDeFoco={retornoDeFoco}
    >
      {panel?.tipo === 'cita' && <FragmentoCitadoEnPanel fuente={panel.fragmento} />}
      {panel?.tipo === 'dato' && (
        <DatoDelPacienteEnPanel
          patientId={patientId}
          enlace={panel.enlace}
          textosDelTurno={panel.textosDelTurno}
        />
      )}
    </Sheet>
  );
}
