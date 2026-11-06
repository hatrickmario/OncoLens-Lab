'use client';

import type { FormEvent } from 'react';
import {
  cuerpoDeTratamiento,
  errorDelCuerpoDeTratamiento,
} from '../../lib/registro-manual/cuerpos';
import { useEnvioDeCorreccion } from '../../lib/correcciones/use-envio-de-correccion';
import { CamposDelTratamientoPrevio } from './campos-del-tratamiento-previo';
import type { TratamientoInicial } from './campos-de-tratamiento';
import { PieDeFormularioDeRegistro } from './pie-de-formulario-de-registro';

const CAMPOS = ['lineNumber', 'setting', 'regimenName', 'startedAt', 'endedAt', 'endReason'];

export interface FormularioDeCorreccionDeTratamientoProps {
  pacienteId: string;
  /** Fila vigente que se corrige: todos sus campos se precargan y el cuerpo viaja completo (reemplazo total). */
  tratamiento: TratamientoInicial;
  /** La corrección se guardó: el llamador recarga la vista de caso y cierra el diálogo. */
  alGuardar: () => void;
  alCerrar: () => void;
}

/** Corrección de un tratamiento previo (d5fb-05): el formulario del alta, precargado; el error sale junto a su campo. */
export function FormularioDeCorreccionDeTratamiento({
  pacienteId,
  tratamiento,
  alGuardar,
  alCerrar,
}: FormularioDeCorreccionDeTratamientoProps) {
  const dato = { pacienteId, dato: 'prior-treatments', id: tratamiento.id } as const;
  const { enviando, error, enviar, fallar } = useEnvioDeCorreccion(dato, alGuardar);
  const errorDe = (campo: string) => (error?.campo === campo ? error.mensaje : undefined);
  const esGeneral = error !== null && !CAMPOS.includes(error.campo ?? '');

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cuerpo = cuerpoDeTratamiento(new FormData(evento.currentTarget));
    const invalido = errorDelCuerpoDeTratamiento(cuerpo);
    if (invalido) fallar(invalido);
    else void enviar(cuerpo);
  }

  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-3">
      <CamposDelTratamientoPrevio errorDe={errorDe} inicial={tratamiento} />
      <PieDeFormularioDeRegistro
        esCorreccion
        enviando={enviando}
        errorGeneral={esGeneral ? error.mensaje : undefined}
        alCancelar={alCerrar}
      />
    </form>
  );
}
