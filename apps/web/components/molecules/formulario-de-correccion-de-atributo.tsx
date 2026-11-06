'use client';

import type { FormEvent } from 'react';
import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rotuloOValor } from '../../lib/caso/presentacion';
import {
  cuerpoDeCorreccionDeAtributo,
  errorDelCuerpoDeAtributoCorregido,
  soloElDia,
} from '../../lib/correcciones/cuerpos';
import { useEnvioDeCorreccion } from '../../lib/correcciones/use-envio-de-correccion';
import { mensajes } from '../../lib/mensajes';
import { CampoDeSeleccion } from './campo-de-seleccion';
import { CampoDeTexto } from './campo-de-texto';
import { PieDeFormularioDeRegistro } from './pie-de-formulario-de-registro';

const CAMPOS = ['value', 'observedAt'];

export interface FormularioDeCorreccionDeAtributoProps {
  pacienteId: string;
  /** Fila vigente que se corrige; su clave se muestra, no se edita (cambiar de clave es otro atributo). */
  atributo: CaseView['attributes'][number];
  /** Valores del catálogo para la clave; no se pasan cuando el valor es fijo. */
  valores?: { value: string; label: string }[];
  /** Valor que no se edita (la declaración de ausencia solo admite «sí»): solo cambia la fecha. */
  valorFijo?: string;
  /** La corrección se guardó: el llamador recarga la vista de caso y cierra el diálogo. */
  alGuardar: () => void;
  alCerrar: () => void;
}

/** Corrección de un atributo clínico (d5fb-05): clave inmutable a la vista, valor del catálogo y fecha precargados. */
export function FormularioDeCorreccionDeAtributo({
  pacienteId,
  atributo,
  valores = [],
  valorFijo,
  alGuardar,
  alCerrar,
}: FormularioDeCorreccionDeAtributoProps) {
  const { caso } = mensajes();
  const { atributo: t, correccion, tratamiento } = caso.registro;
  const nombre =
    valorFijo !== undefined
      ? tratamiento.declaracion.sinTratamiento
      : rotuloOValor(caso.atributosClave, atributo.key);
  const dato = { pacienteId, dato: 'clinical-attributes', id: atributo.id } as const;
  const { enviando, error, enviar, fallar } = useEnvioDeCorreccion(dato, alGuardar);
  const errorDe = (campo: string) => (error?.campo === campo ? error.mensaje : undefined);
  const esGeneral = error !== null && !CAMPOS.includes(error.campo ?? '');

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cuerpo = cuerpoDeCorreccionDeAtributo(new FormData(evento.currentTarget), valorFijo);
    const invalido = errorDelCuerpoDeAtributoCorregido(cuerpo);
    if (invalido) fallar(invalido);
    else void enviar(cuerpo);
  }

  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-3">
      <div>
        <p className="m-0 font-semibold">{t.atributo}</p>
        <p className="m-0">{nombre}</p>
        <p className="text-text-muted m-0 text-sm">
          {valorFijo !== undefined
            ? correccion.declaracion.valorFijo
            : correccion.atributo.claveFija}
        </p>
      </div>
      {valorFijo === undefined && (
        <CampoDeSeleccion
          id="ac-valor"
          name="value"
          defaultValue={atributo.value}
          etiqueta={t.valor}
          error={errorDe('value')}
        >
          <option value="">{t.elegir}</option>
          {valores.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
            </option>
          ))}
        </CampoDeSeleccion>
      )}
      <CampoDeTexto
        id="ac-fecha"
        name="observedAt"
        type="date"
        defaultValue={soloElDia(atributo.observedAt ?? '')}
        etiqueta={t.fecha}
        error={errorDe('observedAt')}
      />
      <PieDeFormularioDeRegistro
        esCorreccion
        enviando={enviando}
        errorGeneral={esGeneral ? error.mensaje : undefined}
        alCancelar={alCerrar}
      />
    </form>
  );
}
