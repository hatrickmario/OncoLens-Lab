'use client';

import type { FormEvent } from 'react';
import type { Biomarker } from '../../../../packages/api-contracts/src/types/clinical-api';
import {
  cuerpoDeCorreccionDeBiomarcador,
  errorDelCuerpoDeBiomarcador,
} from '../../lib/correcciones/cuerpos';
import { useEnvioDeCorreccion } from '../../lib/correcciones/use-envio-de-correccion';
import { mensajes } from '../../lib/mensajes';
import { Button } from '../ui/button';
import { CampoDeCorreccion } from './campo-de-correccion';

const CAMPOS = ['value', 'unit', 'performedAt'];

export interface FormularioDeCorreccionDeBiomarcadorProps {
  biomarcador: Pick<Biomarker, 'id' | 'value' | 'unit'>;
  /** Ruta del BFF del biomarcador (`…/biomarkers/{id}`). */
  ruta: string;
  alGuardar: () => void;
  alCancelar: () => void;
}

/** Corrección en línea (variante A, S5-01): valor, unidad y fecha opcional; el error sale junto al campo y no se cierra. */
export function FormularioDeCorreccionDeBiomarcador({
  biomarcador,
  ruta,
  alGuardar,
  alCancelar,
}: FormularioDeCorreccionDeBiomarcadorProps) {
  const { formulario } = mensajes().ficha.correccion;
  const { enviando, error, enviar, fallar } = useEnvioDeCorreccion(ruta, alGuardar);
  const idBase = `correccion-${biomarcador.id}`;
  const errorDe = (campo: string) => (error?.campo === campo ? error.mensaje : undefined);

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cuerpo = cuerpoDeCorreccionDeBiomarcador(
      new FormData(evento.currentTarget),
      biomarcador.unit,
    );
    const invalido = errorDelCuerpoDeBiomarcador(cuerpo);
    if (invalido) fallar(invalido);
    else void enviar(cuerpo);
  }

  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-wrap items-start gap-3">
      <CampoDeCorreccion
        id={`${idBase}-valor`}
        name="value"
        etiqueta={formulario.valor}
        defaultValue={biomarcador.value}
        error={errorDe('value')}
        autoComplete="off"
      />
      <CampoDeCorreccion
        id={`${idBase}-unidad`}
        name="unit"
        etiqueta={formulario.unidad}
        defaultValue={biomarcador.unit ?? ''}
        error={errorDe('unit')}
        autoComplete="off"
      />
      <CampoDeCorreccion
        id={`${idBase}-fecha`}
        name="performedAt"
        type="date"
        etiqueta={formulario.fecha}
        error={errorDe('performedAt')}
      />
      <div className="flex flex-wrap items-center gap-2 self-center">
        <Button type="submit" disabled={enviando}>
          {enviando ? formulario.guardando : formulario.guardar}
        </Button>
        <Button variante="secundario" onClick={alCancelar}>
          {formulario.cancelar}
        </Button>
      </div>
      <p aria-live="assertive" className="text-error m-0 basis-full">
        {error && !CAMPOS.includes(error.campo ?? '') ? error.mensaje : null}
      </p>
    </form>
  );
}
