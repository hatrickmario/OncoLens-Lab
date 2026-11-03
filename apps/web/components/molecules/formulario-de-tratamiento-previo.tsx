'use client';

import { useState, type FormEvent } from 'react';
import { quedoSinCodigo } from '../../lib/registro-manual/cliente';
import {
  cuerpoDeTratamiento,
  errorDelCuerpoDeTratamiento,
} from '../../lib/registro-manual/cuerpos';
import { useEnvioDeRegistro } from '../../lib/registro-manual/use-envio-de-registro';
import { mensajes } from '../../lib/mensajes';
import { Button } from '../ui/button';
import { CamposDeTratamiento } from './campos-de-tratamiento';
import { CamposDeFinDeTratamiento } from './campos-de-fin-de-tratamiento';
import { PieDeFormularioDeRegistro } from './pie-de-formulario-de-registro';

export interface FormularioDeTratamientoPreviaProps {
  pacienteId: string;
  /** El registro se creó: el llamador recarga la vista de caso. */
  alGuardar: () => void;
  alCerrar: () => void;
}

/** Línea de tratamiento previa a mano (S5-03 d); un término sin código se avisa sin bloquear ni inventar un código (RN-27). */
export function FormularioDeTratamientoPrevio({
  pacienteId,
  alGuardar,
  alCerrar,
}: FormularioDeTratamientoPreviaProps) {
  const { tratamiento: t, cerrar } = mensajes().caso.registro;
  const [enCurso, setEnCurso] = useState(false);
  const [sinCodigo, setSinCodigo] = useState(false);
  const { enviando, error, enviar, fallar } = useEnvioDeRegistro(
    pacienteId,
    'prior-treatments',
    (creado) => {
      alGuardar();
      if (quedoSinCodigo(creado)) setSinCodigo(true);
      else alCerrar();
    },
  );
  const de = (campo: string) => (error?.campo === campo ? error.mensaje : undefined);

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cuerpo = cuerpoDeTratamiento(new FormData(evento.currentTarget));
    const invalido = errorDelCuerpoDeTratamiento(cuerpo);
    if (invalido) fallar(invalido);
    else void enviar(cuerpo);
  }

  if (sinCodigo) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="m-0">
          {t.noMapeado}
        </p>
        <Button onClick={alCerrar}>{cerrar}</Button>
      </div>
    );
  }
  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-3">
      <CamposDeTratamiento errorDe={de} enCurso={enCurso} alCambiarEnCurso={setEnCurso} />
      {!enCurso && <CamposDeFinDeTratamiento errorDe={de} />}
      <PieDeFormularioDeRegistro
        enviando={enviando}
        errorGeneral={error && error.campo === undefined ? error.mensaje : undefined}
        alCancelar={alCerrar}
      />
    </form>
  );
}
