'use client';

import { useRef } from 'react';
import type { Diagnosis } from '../../../../packages/api-contracts/src/types/clinical-api';
import type { PaginaDeRegistro } from '../../lib/registro-manual/enlaces';
import {
  useAperturaDeRegistroManual,
  type AperturaDeRegistroManual,
} from '../../lib/registro-manual/use-apertura-de-registro-manual';
import { mensajes } from '../../lib/mensajes';
import { AccionDeRegistro } from '../molecules/accion-de-registro';
import { FormularioDeDiagnostico } from '../molecules/formulario-de-diagnostico';
import { Dialog } from '../ui/dialog';

export interface DialogoCompletarDiagnosticoProps {
  pacienteId: string;
  egresado: boolean;
  /** Diagnóstico vigente de la ficha (de `obtenerFicha`); `null` sin vigente. */
  diagnostico: Diagnosis | null;
  pagina: PaginaDeRegistro;
  /** Clave de `?item=` de la página; si es un dato del diagnóstico, abre el diálogo con el foco en su campo. */
  item?: string;
  idDelEncabezado: string;
  alGuardar?: () => void;
}

/** Contenido del diálogo: espera las opciones del catálogo; sin ellas no hay con qué llenar las listas. */
function ContenidoDelDiagnostico({
  apertura,
  pacienteId,
  diagnostico,
  alGuardar,
}: Pick<DialogoCompletarDiagnosticoProps, 'pacienteId' | 'diagnostico'> & {
  apertura: AperturaDeRegistroManual;
  alGuardar: () => void;
}) {
  const t = mensajes().registroManual.diagnostico;
  const { lectura, deLaUrl } = apertura;
  if (lectura === null) {
    return (
      <p role="status" aria-busy="true" className="m-0">
        {t.cargando}
      </p>
    );
  }
  if (lectura.tipo === 'error') return <p className="m-0">{t.opcionesNoDisponibles}</p>;
  return (
    <FormularioDeDiagnostico
      pacienteId={pacienteId}
      vigente={diagnostico}
      opciones={lectura.opciones}
      enfocar={deLaUrl?.entidad === 'Diagnosis' ? deLaUrl.campo : undefined}
      alGuardar={alGuardar}
      alCerrar={apertura.cerrar}
    />
  );
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
