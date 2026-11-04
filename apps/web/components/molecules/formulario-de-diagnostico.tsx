'use client';

import { useState, type FormEvent } from 'react';
import type {
  Diagnosis,
  ManualEntryOptions,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import {
  cambiosDelDiagnostico,
  erroresDelDiagnostico,
  formularioInicial,
  type FormularioDeDiagnostico as Formulario,
} from '../../lib/registro-manual/diagnostico';
import { idDelCampoConFoco, useFocoInicial } from '../../lib/registro-manual/foco';
import type { CampoConFoco } from '../../lib/registro-manual/resolver-item';
import { useEnvioDeRegistro } from '../../lib/registro-manual/use-envio-de-registro';
import { mensajes } from '../../lib/mensajes';
import { Alert } from '../ui/alert';
import { AnuncioDeErrores } from './anuncio-de-errores';
import { CamposDeGradacion } from './campos-de-gradacion';
import { CamposDelDiagnostico } from './campos-del-diagnostico';
import { PieDeFormularioDeRegistro } from './pie-de-formulario-de-registro';

export interface FormularioDeDiagnosticoProps {
  pacienteId: string;
  /** Diagnóstico vigente de la ficha: precarga los campos; `null` si el paciente no tiene (crea uno). */
  vigente: Diagnosis | null;
  opciones: ManualEntryOptions;
  /** Campo de `?item=` que recibe el foco al abrir. */
  enfocar: CampoConFoco | undefined;
  /** El registro se creó: el llamador refresca la ficha o la vista de caso. */
  alGuardar: () => void;
  alCerrar: () => void;
}

/**
 * Completar el diagnóstico a mano (S5-03 b): con vigente envía solo los campos cambiados y avisa que la corrección
 * pasa el vigente a histórico (RN-08); `grade` se muestra derivado y de solo lectura (D5).
 */
export function FormularioDeDiagnostico({
  pacienteId,
  vigente,
  opciones,
  enfocar,
  alGuardar,
  alCerrar,
}: FormularioDeDiagnosticoProps) {
  const t = mensajes().registroManual.diagnostico;
  const [formulario, setFormulario] = useState<Formulario>(() =>
    formularioInicial(vigente, opciones.gradingSystems),
  );
  const [locales, setLocales] = useState<Record<string, string>>({});
  useFocoInicial(idDelCampoConFoco(enfocar, opciones.gradingSystems, formulario.gradacion.sistema));
  const { enviando, error, enviar, fallar } = useEnvioDeRegistro(pacienteId, 'diagnoses', () => {
    alGuardar();
    alCerrar();
  });
  const errores = { ...locales, ...(error?.campo ? { [error.campo]: error.mensaje } : {}) };
  const general = error && error.campo === undefined ? error.mensaje : undefined;
  const cambios = cambiosDelDiagnostico(vigente, formulario);
  const sinCambios = vigente !== null && Object.keys(cambios).length === 0;

  function alEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const invalidos = erroresDelDiagnostico(vigente, formulario);
    setLocales(invalidos);
    fallar(null);
    if (Object.keys(invalidos).length === 0) void enviar(cambios);
  }

  return (
    <form onSubmit={alEnviar} noValidate className="flex flex-col gap-3">
      {general && <Alert>{general}</Alert>}
      {vigente && <p className="m-0">{t.avisoDeCorreccion}</p>}
      <CamposDelDiagnostico
        formulario={formulario}
        alCambiar={(campo, valor) => setFormulario({ ...formulario, [campo]: valor })}
        opciones={opciones}
        errores={errores}
      />
      <CamposDeGradacion
        valor={formulario.gradacion}
        alCambiar={(gradacion) => setFormulario({ ...formulario, gradacion })}
        sistemas={opciones.gradingSystems}
        error={errores.grading}
      />
      {vigente && <p className="m-0">{`${t.gradoDerivado}: ${vigente.grade ?? t.sinGrado}`}</p>}
      <AnuncioDeErrores cantidad={Object.keys(errores).length} />
      <PieDeFormularioDeRegistro
        enviando={enviando}
        errorGeneral={undefined}
        alCancelar={alCerrar}
        avisoDeSinCambios={sinCambios ? t.sinCambios : undefined}
      />
    </form>
  );
}
