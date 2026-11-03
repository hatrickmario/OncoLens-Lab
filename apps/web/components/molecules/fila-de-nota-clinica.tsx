'use client';

import { useRef, useState } from 'react';
import type { ClinicalNote } from '../../../../packages/api-contracts/src/types/clinical-api';
import { fechaRelativa } from '../../lib/ficha/fecha-relativa';
import { formatearFecha } from '../../lib/ficha/presentacion';
import { mensajes } from '../../lib/mensajes';
import { Dialog } from '../ui/dialog';
import { AccionCorregirDato } from './accion-corregir-dato';
import { FormularioDeCorreccionDeNota } from './formulario-de-correccion-de-nota';
import { HistoricoDelDato } from './historico-del-dato';

export interface FilaDeNotaClinicaProps {
  nota: ClinicalNote;
  pacienteId: string;
  egresado: boolean;
  idDeAyuda: string;
}

/** Una nota vigente: tipo, texto (solo texto, nunca HTML), origen, fecha relativa, corrección en diálogo e histórico. */
export function FilaDeNotaClinica({
  nota,
  pacienteId,
  egresado,
  idDeAyuda,
}: FilaDeNotaClinicaProps) {
  const { ficha } = mensajes();
  const { formulario } = ficha.correccion;
  const [corrigiendo, setCorrigiendo] = useState(false);
  const botonDeCorreccion = useRef<HTMLButtonElement>(null);
  const dato = { pacienteId, dato: 'clinical-notes', id: nota.id } as const;
  const tipo = ficha.notas.tipos[nota.noteType];

  return (
    <li className="border-border border-b py-3 last:border-b-0">
      <p className="m-0 flex flex-wrap items-baseline gap-x-2">
        <strong>{tipo}</strong>
        <time dateTime={nota.recordedAt} title={formatearFecha(nota.recordedAt)}>
          {fechaRelativa(nota.recordedAt, new Date())}
        </time>
        <span className="text-text-muted">{ficha.origen[nota.provenance.entryMethod]}</span>
      </p>
      <p className="m-0 my-2 whitespace-pre-wrap">{nota.content}</p>
      <AccionCorregirDato
        ref={botonDeCorreccion}
        nombre={tipo}
        egresado={egresado}
        idDeAyuda={idDeAyuda}
        alAbrir={() => {
          setCorrigiendo(true);
        }}
      />
      {nota.supersedesId && <HistoricoDelDato key={nota.id} dato={dato} />}
      <Dialog
        abierto={corrigiendo}
        retornoDeFoco={botonDeCorreccion}
        alCambiar={setCorrigiendo}
        titulo={formulario.tituloDeNota}
        descripcion={formulario.descripcionDeNota}
      >
        <FormularioDeCorreccionDeNota
          nota={nota}
          dato={dato}
          alGuardar={() => {
            setCorrigiendo(false);
          }}
          alCancelar={() => setCorrigiendo(false)}
        />
      </Dialog>
    </li>
  );
}
