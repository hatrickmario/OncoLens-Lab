'use client';

import { useState, type ReactNode } from 'react';
import type { Biomarker } from '../../../../packages/api-contracts/src/types/clinical-api';
import { AvisoAnalisisAnteriores } from '../atoms/aviso-analisis-anteriores';
import { BiomarcadorCorregible } from './biomarcador-corregible';
import { EncabezadoDeTabla } from './encabezado-de-tabla';

export interface FilaDeBiomarcador {
  biomarcador: Biomarker;
  /** Celdas de lectura de la fila, renderizadas en el servidor. */
  celdas: ReactNode;
}

export interface TablaDeBiomarcadoresCorregiblesProps {
  columnas: string[];
  columnaDeAcciones: string;
  filas: FilaDeBiomarcador[];
  pacienteId: string;
  egresado: boolean;
  idDeAyuda: string;
  hoy: string;
}

/**
 * Tabla de biomarcadores y dueña del aviso «los análisis anteriores…» (RN-26, US-253 AC-5): una corrección cambia el
 * id del dato y su fila se remonta, así que el aviso no puede vivir en la fila.
 */
export function TablaDeBiomarcadoresCorregibles({
  columnas,
  columnaDeAcciones,
  filas,
  ...comunes
}: TablaDeBiomarcadoresCorregiblesProps) {
  const [huboCorreccion, setHuboCorreccion] = useState(false);
  return (
    <>
      <table className="w-full border-collapse">
        <EncabezadoDeTabla columnas={columnas} columnaDeAcciones={columnaDeAcciones} />
        {filas.map(({ biomarcador, celdas }) => (
          <BiomarcadorCorregible
            key={biomarcador.id}
            biomarcador={biomarcador}
            columnas={columnas.length}
            alCorregir={() => setHuboCorreccion(true)}
            {...comunes}
          >
            {celdas}
          </BiomarcadorCorregible>
        ))}
      </table>
      {huboCorreccion && <AvisoAnalisisAnteriores />}
    </>
  );
}
