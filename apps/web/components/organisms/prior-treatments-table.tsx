'use client';

import type { ReactNode } from 'react';
import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { useCorreccionEnTabla } from '../../lib/correcciones/use-correccion-en-tabla';
import { mensajes } from '../../lib/mensajes';
import { AvisoAnalisisAnteriores } from '../atoms/aviso-analisis-anteriores';
import { EncabezadoDeTabla } from '../molecules/encabezado-de-tabla';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { FilaDeTratamiento } from './fila-de-tratamiento';
import { SinTratamientoDeclarado } from './sin-tratamiento-declarado';

type Tratamiento = CaseView['priorTreatments'][number];
type Declaracion = CaseView['attributes'][number];

export interface PriorTreatmentsTableProps {
  tratamientos: Tratamiento[];
  hoy: string;
  pacienteId: string;
  egresado: boolean;
  /** Recarga la vista de caso tras corregir un dato (`201`). */
  alGuardar: () => void;
  accion?: ReactNode;
  /** Declaración vigente «Sin tratamiento previo»: solo se muestra cuando no hay tratamientos. */
  declaracion?: Declaracion | null;
}

/**
 * Tratamientos previos en el orden del servidor, cada uno corregible con histórico (ADR-50, d5fb-05). Dueña del aviso
 * «los análisis anteriores…» (RN-26): una corrección cambia el `id` y la fila se remonta, así que el aviso vive aquí.
 */
export function PriorTreatmentsTable({
  tratamientos,
  hoy,
  pacienteId,
  egresado,
  alGuardar,
  accion,
  declaracion = null,
}: PriorTreatmentsTableProps) {
  const { caso, ficha } = mensajes();
  const c = caso.columnas;
  const correccion = useCorreccionEnTabla(alGuardar);
  const estado = { hayTratamientos: tratamientos.length > 0, declaracion };
  return (
    <SeccionDeFicha id="caso-tratamientos" titulo={caso.secciones.tratamientos} accion={accion}>
      {tratamientos.length === 0 && declaracion !== null ? (
        <SinTratamientoDeclarado
          declaracion={declaracion}
          hoy={hoy}
          pacienteId={pacienteId}
          egresado={egresado}
          enfocar={correccion.esReemplazo(declaracion.supersedesId)}
          alGuardar={correccion.alCorregir(declaracion.id)}
        />
      ) : tratamientos.length === 0 ? (
        <p className="m-0">{caso.sinDatos}</p>
      ) : (
        <table className="w-full border-collapse">
          <EncabezadoDeTabla
            columnas={[c.linea, c.contexto, c.esquema, c.inicio, c.fin, c.origen]}
            columnaDeAcciones={ficha.biomarcadores.acciones}
          />
          {tratamientos.map((t) => (
            <FilaDeTratamiento
              key={t.id}
              t={t}
              hoy={hoy}
              pacienteId={pacienteId}
              egresado={egresado}
              estado={estado}
              enfocar={correccion.esReemplazo(t.supersedesId)}
              alGuardar={correccion.alCorregir(t.id)}
            />
          ))}
        </table>
      )}
      {correccion.huboCorreccion && <AvisoAnalisisAnteriores />}
    </SeccionDeFicha>
  );
}
