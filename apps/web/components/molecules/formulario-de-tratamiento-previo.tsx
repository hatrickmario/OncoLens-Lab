'use client';

import { useState, type FormEvent } from 'react';
import { zPriorTreatmentManualCreate } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { quedoSinCodigo } from '../../lib/registro-manual/cliente';
import {
  cuerpoDeTratamiento,
  errorDelCuerpoDeTratamiento,
} from '../../lib/registro-manual/cuerpos';
import { useEnvioDeRegistro } from '../../lib/registro-manual/use-envio-de-registro';
import { mensajes } from '../../lib/mensajes';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { CampoDeCorreccion } from './campo-de-correccion';
import { CampoDeSeleccion } from './campo-de-seleccion';

const CONTEXTOS = zPriorTreatmentManualCreate.shape.setting.options;
const MOTIVOS = zPriorTreatmentManualCreate.shape.endReason.unwrap().options;

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
  const { tratamiento: t, guardar, guardando, cancelar, cerrar } = mensajes().caso.registro;
  const { contextos, motivosDeFin } = mensajes().caso;
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
      <CampoDeCorreccion
        id="tp-linea"
        name="lineNumber"
        type="number"
        min={1}
        etiqueta={t.linea}
        error={de('lineNumber')}
      />
      <CampoDeSeleccion
        id="tp-contexto"
        name="setting"
        defaultValue="desconocido"
        etiqueta={t.contexto}
        error={de('setting')}
      >
        {CONTEXTOS.map((c) => (
          <option key={c} value={c}>
            {contextos[c]}
          </option>
        ))}
      </CampoDeSeleccion>
      <CampoDeCorreccion
        id="tp-esquema"
        name="regimenName"
        etiqueta={t.esquema}
        error={de('regimenName')}
      />
      <CampoDeCorreccion
        id="tp-inicio"
        name="startedAt"
        type="date"
        etiqueta={t.inicio}
        error={de('startedAt')}
      />
      <div className="flex min-h-11 items-center gap-2">
        <input
          id="tp-en-curso"
          name="ongoing"
          type="checkbox"
          checked={enCurso}
          onChange={(e) => setEnCurso(e.target.checked)}
        />
        <Label htmlFor="tp-en-curso">{t.enCurso}</Label>
      </div>
      {!enCurso && (
        <>
          <CampoDeCorreccion
            id="tp-fin"
            name="endedAt"
            type="date"
            etiqueta={t.fin}
            error={de('endedAt')}
          />
          <CampoDeSeleccion
            id="tp-motivo"
            name="endReason"
            defaultValue=""
            etiqueta={t.motivoDeFin}
            error={de('endReason')}
          >
            <option value="">{mensajes().caso.registro.atributo.elegir}</option>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {motivosDeFin[m]}
              </option>
            ))}
          </CampoDeSeleccion>
        </>
      )}
      <p aria-live="assertive" className="text-error m-0">
        {error && error.campo === undefined ? error.mensaje : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={enviando}>
          {enviando ? guardando : guardar}
        </Button>
        <Button variante="secundario" onClick={alCerrar}>
          {cancelar}
        </Button>
      </div>
    </form>
  );
}
