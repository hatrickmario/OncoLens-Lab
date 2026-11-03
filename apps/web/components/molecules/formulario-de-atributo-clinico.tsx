'use client';

import { useState, type FormEvent } from 'react';
import { cuerpoDeAtributo, errorDelCuerpoDeAtributo } from '../../lib/registro-manual/cuerpos';
import type { AtributoPermitido } from '../../lib/registro-manual/cliente';
import { useEnvioDeRegistro } from '../../lib/registro-manual/use-envio-de-registro';
import { mensajes } from '../../lib/mensajes';
import { Button } from '../ui/button';
import { CampoDeCorreccion } from './campo-de-correccion';
import { CampoDeSeleccion } from './campo-de-seleccion';

export interface FormularioDeAtributoClinicoProps {
  pacienteId: string;
  /** Solo los atributos del catálogo para el tipo de cáncer del paciente (RN-29). */
  permitidos: AtributoPermitido[];
  /** El registro se creó: el llamador recarga la vista de caso y cierra el diálogo. */
  alGuardar: () => void;
  alCerrar: () => void;
}

/** Atributo clínico a mano (S5-03 c): clave y valor salen de la lista del catálogo; el servidor vuelve a validar. */
export function FormularioDeAtributoClinico({
  pacienteId,
  permitidos,
  alGuardar,
  alCerrar,
}: FormularioDeAtributoClinicoProps) {
  const { atributo: t, guardar, guardando, cancelar } = mensajes().caso.registro;
  const [clave, setClave] = useState('');
  const { enviando, error, enviar, fallar } = useEnvioDeRegistro(
    pacienteId,
    'clinical-attributes',
    alGuardar,
  );
  const de = (campo: string) => (error?.campo === campo ? error.mensaje : undefined);
  const valores = permitidos.find((a) => a.key === clave)?.values ?? [];

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const cuerpo = cuerpoDeAtributo(new FormData(evento.currentTarget));
    const invalido = errorDelCuerpoDeAtributo(cuerpo);
    if (invalido) fallar(invalido);
    else void enviar(cuerpo);
  }

  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-3">
      <CampoDeSeleccion
        id="ac-atributo"
        name="attributeKey"
        value={clave}
        onChange={(e) => setClave(e.target.value)}
        etiqueta={t.atributo}
        error={de('attributeKey')}
      >
        <option value="">{t.elegir}</option>
        {permitidos.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </CampoDeSeleccion>
      <CampoDeSeleccion
        key={clave}
        id="ac-valor"
        name="value"
        defaultValue=""
        etiqueta={t.valor}
        error={de('value')}
      >
        <option value="">{t.elegir}</option>
        {valores.map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </CampoDeSeleccion>
      <CampoDeCorreccion
        id="ac-fecha"
        name="observedAt"
        type="date"
        etiqueta={t.fecha}
        error={de('observedAt')}
      />
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
