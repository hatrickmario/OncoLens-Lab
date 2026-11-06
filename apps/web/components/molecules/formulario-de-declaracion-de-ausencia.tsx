'use client';

import type { FormEvent } from 'react';
import { soloElDia } from '../../lib/correcciones/cuerpos';
import { mensajes } from '../../lib/mensajes';
import {
  cuerpoDeDeclaracion,
  errorDeLaDeclaracion,
} from '../../lib/registro-manual/declaracion-de-ausencia';
import { useEnvioDeRegistro } from '../../lib/registro-manual/use-envio-de-registro';
import { CampoDeTexto } from './campo-de-texto';
import { PieDeFormularioDeRegistro } from './pie-de-formulario-de-registro';

export interface FormularioDeDeclaracionDeAusenciaProps {
  pacienteId: string;
  /** «Hoy» del servidor: fecha por defecto y tope de la declaración. */
  hoy: string;
  /** El registro se creó: el llamador recarga la vista de caso y cierra el diálogo. */
  alGuardar: () => void;
  alCerrar: () => void;
}

/** Declaración «Sin tratamiento previo a la fecha»: solo pide la fecha; no crea ningún tratamiento. */
export function FormularioDeDeclaracionDeAusencia({
  pacienteId,
  hoy,
  alGuardar,
  alCerrar,
}: FormularioDeDeclaracionDeAusenciaProps) {
  const { declaracion: d } = mensajes().caso.registro.tratamiento;
  const { enviando, error, enviar, fallar } = useEnvioDeRegistro(
    pacienteId,
    'clinical-attributes',
    alGuardar,
  );
  const conTratamientos = error?.campo === 'attributeKey';

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cuerpo = cuerpoDeDeclaracion(
      String(new FormData(evento.currentTarget).get('observedAt')),
    );
    const invalido = errorDeLaDeclaracion(cuerpo, hoy);
    if (invalido) fallar(invalido);
    else void enviar(cuerpo);
  }

  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-3">
      <CampoDeTexto
        id="dc-fecha"
        name="observedAt"
        type="date"
        etiqueta={d.fecha}
        defaultValue={soloElDia(hoy)}
        max={soloElDia(hoy)}
        error={error?.campo === 'observedAt' ? error.mensaje : undefined}
      />
      <PieDeFormularioDeRegistro
        enviando={enviando}
        errorGeneral={
          conTratamientos
            ? d.conTratamientos
            : error && error.campo === undefined
              ? error.mensaje
              : undefined
        }
        alCancelar={alCerrar}
      />
    </form>
  );
}
