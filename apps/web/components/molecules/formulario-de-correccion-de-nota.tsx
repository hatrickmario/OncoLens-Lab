'use client';

import type { FormEvent } from 'react';
import type { ClinicalNote } from '../../../../packages/api-contracts/src/types/clinical-api';
import { zNoteType } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { cuerpoDeCorreccionDeNota, errorDelCuerpoDeNota } from '../../lib/correcciones/cuerpos';
import { useEnvioDeCorreccion } from '../../lib/correcciones/use-envio-de-correccion';
import { mensajes } from '../../lib/mensajes';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { CampoDeCorreccion } from './campo-de-correccion';

export interface FormularioDeCorreccionDeNotaProps {
  nota: Pick<ClinicalNote, 'id' | 'noteType' | 'content'>;
  /** Ruta del BFF de la nota (`…/clinical-notes/{id}`). */
  ruta: string;
  alGuardar: () => void;
  alCancelar: () => void;
}

/** Corrección de una nota: el aviso fijo de nombres va encima del campo (ADR-40, RN-11); el texto es solo texto. */
export function FormularioDeCorreccionDeNota({
  nota,
  ruta,
  alGuardar,
  alCancelar,
}: FormularioDeCorreccionDeNotaProps) {
  const { formulario, avisoNombres } = mensajes().ficha.correccion;
  const { notas } = mensajes().ficha;
  const { enviando, error, enviar, fallar } = useEnvioDeCorreccion(ruta, alGuardar);
  const idBase = `correccion-${nota.id}`;

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cuerpo = cuerpoDeCorreccionDeNota(new FormData(evento.currentTarget));
    const invalido = errorDelCuerpoDeNota(cuerpo);
    if (invalido) fallar(invalido);
    else void enviar(cuerpo);
  }

  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idBase}-tipo`}>{formulario.tipoDeNota}</Label>
        <select
          id={`${idBase}-tipo`}
          name="noteType"
          defaultValue={nota.noteType}
          className="rounded-control border-control-border bg-surface text-text min-h-11 border px-3"
        >
          {zNoteType.options.map((tipo) => (
            <option key={tipo} value={tipo}>
              {notas.tipos[tipo]}
            </option>
          ))}
        </select>
      </div>
      <p className="text-text-muted m-0">{avisoNombres}</p>
      <CampoDeCorreccion
        id={`${idBase}-texto`}
        name="content"
        etiqueta={formulario.nota}
        multilinea
        defaultValue={nota.content}
        error={error?.campo === 'content' ? error.mensaje : undefined}
      />
      <p aria-live="assertive" className="text-error m-0">
        {error && error.campo !== 'content' ? error.mensaje : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={enviando}>
          {enviando ? formulario.guardando : formulario.guardar}
        </Button>
        <Button variante="secundario" onClick={alCancelar}>
          {formulario.cancelar}
        </Button>
      </div>
    </form>
  );
}
