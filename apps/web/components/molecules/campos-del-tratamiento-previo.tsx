'use client';

import { useState } from 'react';
import { CamposDeFinDeTratamiento } from './campos-de-fin-de-tratamiento';
import { CamposDeTratamiento, type TratamientoInicial } from './campos-de-tratamiento';

/** Todos los campos de un tratamiento previo (alta vacía o corrección precargada): el fin solo se pide si ya terminó. */
export function CamposDelTratamientoPrevio({
  errorDe,
  inicial,
}: {
  errorDe: (campo: string) => string | undefined;
  inicial?: TratamientoInicial;
}) {
  const [enCurso, setEnCurso] = useState(inicial?.ongoing ?? false);
  return (
    <>
      <CamposDeTratamiento
        errorDe={errorDe}
        enCurso={enCurso}
        alCambiarEnCurso={setEnCurso}
        inicial={inicial}
      />
      {!enCurso && <CamposDeFinDeTratamiento errorDe={errorDe} inicial={inicial} />}
    </>
  );
}
