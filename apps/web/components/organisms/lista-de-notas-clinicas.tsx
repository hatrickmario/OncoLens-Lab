'use client';

import { useState } from 'react';
import type { ClinicalNote } from '../../../../packages/api-contracts/src/types/clinical-api';
import { AvisoAnalisisAnteriores } from '../atoms/aviso-analisis-anteriores';
import { FilaDeNotaClinica } from '../molecules/fila-de-nota-clinica';

export interface ListaDeNotasClinicasProps {
  notas: ClinicalNote[];
  pacienteId: string;
  egresado: boolean;
  idDeAyuda: string;
}

/**
 * Lista de notas vigentes y dueña del aviso «los análisis anteriores…» (RN-26): una corrección cambia el id de la nota
 * y su fila se remonta, así que el aviso no puede vivir en la fila (US-253 AC-5).
 */
export function ListaDeNotasClinicas({ notas, ...comunes }: ListaDeNotasClinicasProps) {
  const [huboCorreccion, setHuboCorreccion] = useState(false);
  return (
    <>
      <ul className="m-0 list-none p-0">
        {notas.map((nota) => (
          <FilaDeNotaClinica
            key={nota.id}
            nota={nota}
            {...comunes}
            alCorregir={() => setHuboCorreccion(true)}
          />
        ))}
      </ul>
      {huboCorreccion && <AvisoAnalisisAnteriores />}
    </>
  );
}
