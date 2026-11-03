'use client';

import { useState, type ReactNode } from 'react';
import type { Biomarker } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rutaDelDato } from '../../lib/correcciones/cliente';
import { AvisoAnalisisAnteriores } from '../atoms/aviso-analisis-anteriores';
import { AccionCorregirDato } from './accion-corregir-dato';
import { FormularioDeCorreccionDeBiomarcador } from './formulario-de-correccion-de-biomarcador';
import { HistoricoDelDato } from './historico-del-dato';

export interface BiomarcadorCorregibleProps {
  biomarcador: Biomarker;
  pacienteId: string;
  egresado: boolean;
  idDeAyuda: string;
  /** Número de columnas de lectura de la tabla; la acción añade una. */
  columnas: number;
  /** Celdas de lectura de la fila, renderizadas en el servidor. */
  children: ReactNode;
}

function FilaAncha({ columnas, children }: { columnas: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={columnas + 1} className="border-border border-b px-3 py-2">
        {children}
      </td>
    </tr>
  );
}

/**
 * Un biomarcador de la tabla con su corrección en línea y su histórico bajo la fila (variante A, S5-01). Es un
 * `<tbody>` por dato: la fila alterna entre lectura y formulario sin tocar las demás.
 */
export function BiomarcadorCorregible({
  biomarcador,
  pacienteId,
  egresado,
  idDeAyuda,
  columnas,
  children,
}: BiomarcadorCorregibleProps) {
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const ruta = rutaDelDato(pacienteId, 'biomarkers', biomarcador.id);

  return (
    <tbody>
      <tr>
        {children}
        <td className="border-border border-b px-3 py-2 align-top">
          <AccionCorregirDato
            nombre={biomarcador.name}
            egresado={egresado}
            idDeAyuda={idDeAyuda}
            alAbrir={() => {
              setGuardado(false);
              setCorrigiendo(true);
            }}
          />
        </td>
      </tr>
      {corrigiendo && (
        <FilaAncha columnas={columnas}>
          <FormularioDeCorreccionDeBiomarcador
            biomarcador={biomarcador}
            ruta={ruta}
            alGuardar={() => {
              setCorrigiendo(false);
              setGuardado(true);
            }}
            alCancelar={() => setCorrigiendo(false)}
          />
        </FilaAncha>
      )}
      {guardado && (
        <FilaAncha columnas={columnas}>
          <AvisoAnalisisAnteriores />
        </FilaAncha>
      )}
      {biomarcador.supersedesId && (
        <FilaAncha columnas={columnas}>
          <HistoricoDelDato key={biomarcador.id} ruta={ruta} />
        </FilaAncha>
      )}
    </tbody>
  );
}
