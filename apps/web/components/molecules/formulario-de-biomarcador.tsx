'use client';

import { useState, type FormEvent } from 'react';
import {
  biomarcadorSinCodigo,
  cuerpoDeBiomarcador,
  erroresDelBiomarcador,
} from '../../lib/registro-manual/biomarcador';
import { ID_DE_CAMPO, useFocoInicial } from '../../lib/registro-manual/foco';
import type { LecturaDelCatalogo } from '../../lib/registro-manual/valores-del-catalogo';
import { useEnvioDeRegistro } from '../../lib/registro-manual/use-envio-de-registro';
import { mensajes } from '../../lib/mensajes';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { AnuncioDeErrores } from './anuncio-de-errores';
import { CamposDeBiomarcador } from './campos-de-biomarcador';
import { PieDeFormularioDeRegistro } from './pie-de-formulario-de-registro';

export interface FormularioDeBiomarcadorProps {
  pacienteId: string;
  /** Opciones del catálogo; `null` mientras se leen y `error` si no cargaron: el formulario sigue usable con texto libre. */
  lectura: LecturaDelCatalogo | null;
  /** Término de `?item=`: llega seleccionado y el foco va al valor. */
  terminoInicial?: string;
  /** El registro se creó: el llamador refresca la ficha o la vista de caso. */
  alGuardar: () => void;
  alCerrar: () => void;
}

/** Biomarcador a mano (S5-03 a): autocompletado nativo con los términos del catálogo y texto libre (RN-27). */
export function FormularioDeBiomarcador({
  pacienteId,
  lectura,
  terminoInicial,
  alGuardar,
  alCerrar,
}: FormularioDeBiomarcadorProps) {
  const t = mensajes().registroManual.biomarcador;
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
  const terminos = lectura?.tipo === 'ok' ? lectura.catalogoDeRegistro.biomarkerTerms : [];

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
      {lectura?.tipo === 'error' && (
        <p role="status" className="m-0">
          {t.terminosNoDisponibles}
        </p>
      )}
      <CamposDeBiomarcador errores={errores} terminos={terminos} terminoInicial={terminoInicial} />
      <AnuncioDeErrores cantidad={Object.keys(errores).length} />
      <PieDeFormularioDeRegistro
        enviando={enviando}
        errorGeneral={undefined}
        alCancelar={alCerrar}
      />
    </form>
  );
}
