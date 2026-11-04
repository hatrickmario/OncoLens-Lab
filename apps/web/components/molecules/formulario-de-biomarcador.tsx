'use client';

import { useState, type FormEvent } from 'react';
import {
  biomarcadorSinCodigo,
  cuerpoDeBiomarcador,
  erroresDelBiomarcador,
} from '../../lib/registro-manual/biomarcador';
import { ID_DE_CAMPO, useFocoInicial } from '../../lib/registro-manual/foco';
import type { LecturaDeOpciones } from '../../lib/registro-manual/opciones';
import { useEnvioDeRegistro } from '../../lib/registro-manual/use-envio-de-registro';
import { mensajes } from '../../lib/mensajes';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { AnuncioDeErrores } from './anuncio-de-errores';
import { CampoDeSeleccion } from './campo-de-seleccion';
import { CampoDeTexto } from './campo-de-texto';
import { PieDeFormularioDeRegistro } from './pie-de-formulario-de-registro';

export interface FormularioDeBiomarcadorProps {
  pacienteId: string;
  /** Opciones del catálogo; `null` mientras se leen y `error` si no cargaron: el formulario sigue usable con texto libre. */
  opciones: LecturaDeOpciones | null;
  /** Término de `?item=`: llega seleccionado y el foco va al valor. */
  terminoInicial?: string;
  /** El registro se creó: el llamador refresca la ficha o la vista de caso. */
  alGuardar: () => void;
  alCerrar: () => void;
}

/** Biomarcador a mano (S5-03 a): autocompletado nativo con los términos del catálogo y texto libre (RN-27). */
export function FormularioDeBiomarcador({
  pacienteId,
  opciones,
  terminoInicial,
  alGuardar,
  alCerrar,
}: FormularioDeBiomarcadorProps) {
  const { biomarcador: t, elegir } = mensajes().registroManual;
  const [locales, setLocales] = useState<Record<string, string>>({});
  const [sinCodigo, setSinCodigo] = useState(false);
  useFocoInicial(terminoInicial === undefined ? undefined : ID_DE_CAMPO.biomarcadorValor);
  const { enviando, error, enviar, fallar } = useEnvioDeRegistro(
    pacienteId,
    'biomarkers',
    (creado) => {
      alGuardar();
      if (biomarcadorSinCodigo(creado)) setSinCodigo(true);
      else alCerrar();
    },
  );
  const errores = { ...locales, ...(error?.campo ? { [error.campo]: error.mensaje } : {}) };
  const general = error && error.campo === undefined ? error.mensaje : undefined;
  const terminos = opciones?.tipo === 'ok' ? opciones.opciones.biomarkerTerms : [];

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cuerpo = cuerpoDeBiomarcador(new FormData(evento.currentTarget));
    const invalidos = erroresDelBiomarcador(cuerpo);
    setLocales(invalidos);
    fallar(null);
    if (Object.keys(invalidos).length === 0) void enviar(cuerpo);
  }

  if (sinCodigo) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="status" className="m-0">
          {t.noMapeado}
        </p>
        <Button onClick={alCerrar}>{mensajes().caso.registro.cerrar}</Button>
      </div>
    );
  }
  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-3">
      {general && <Alert>{general}</Alert>}
      {opciones?.tipo === 'error' && (
        <p role="status" className="m-0">
          {t.terminosNoDisponibles}
        </p>
      )}
      <CampoDeTexto
        id="rm-biomarcador-nombre"
        name="name"
        list="rm-biomarcador-terminos"
        defaultValue={terminoInicial ?? ''}
        etiqueta={t.nombre}
        error={errores.name}
        autoComplete="off"
      />
      <datalist id="rm-biomarcador-terminos">
        {terminos.map((termino) => (
          <option key={termino.term} value={termino.term} label={termino.label} />
        ))}
      </datalist>
      <CampoDeTexto
        id={ID_DE_CAMPO.biomarcadorValor}
        name="value"
        etiqueta={t.valor}
        error={errores.value}
        autoComplete="off"
      />
      <CampoDeTexto
        id="rm-biomarcador-unidad"
        name="unit"
        etiqueta={t.unidad}
        error={errores.unit}
      />
      <CampoDeSeleccion
        id="rm-biomarcador-tipo"
        name="resultType"
        defaultValue=""
        etiqueta={t.tipoDeResultado}
        error={errores.resultType}
      >
        <option value="">{elegir}</option>
        <option value="cuantitativo">{t.cuantitativo}</option>
        <option value="cualitativo">{t.cualitativo}</option>
      </CampoDeSeleccion>
      <CampoDeTexto
        id="rm-biomarcador-fecha"
        name="performedAt"
        type="date"
        etiqueta={t.fecha}
        error={errores.performedAt}
      />
      <AnuncioDeErrores cantidad={Object.keys(errores).length} />
      <PieDeFormularioDeRegistro
        enviando={enviando}
        errorGeneral={undefined}
        alCancelar={alCerrar}
      />
    </form>
  );
}
