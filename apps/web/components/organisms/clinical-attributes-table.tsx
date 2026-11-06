'use client';

import type { ReactNode } from 'react';
import type { CaseView } from '../../../../packages/api-contracts/src/types/clinical-api';
import { rotuloOValor } from '../../lib/caso/presentacion';
import { useCorreccionEnTabla } from '../../lib/correcciones/use-correccion-en-tabla';
import { mensajes } from '../../lib/mensajes';
import { AvisoAnalisisAnteriores } from '../atoms/aviso-analisis-anteriores';
import { FechaRelativaOpcional } from '../atoms/fecha-relativa';
import { CELDA, EncabezadoDeTabla } from '../molecules/encabezado-de-tabla';
import { FilaConHistorico } from '../molecules/fila-con-historico';
import { SeccionDeFicha } from '../molecules/fila-de-ficha';
import { HistoricoDelDato } from '../molecules/historico-del-dato';
import { ProcedenciaDelDato } from '../molecules/procedencia-del-dato';
import { DialogoAtributoClinico } from './dialogo-atributo-clinico';

type Atributo = CaseView['attributes'][number];

export interface ClinicalAttributesTableProps {
  atributos: Atributo[];
  hoy: string;
  pacienteId: string;
  egresado: boolean;
  /** Recarga la vista de caso tras corregir un dato (`201`). */
  alGuardar: () => void;
  accion?: ReactNode;
}

/**
 * Atributos clínicos (atributo, valor, fecha, origen) en el orden del servidor; sin rótulo se muestra el valor crudo.
 * Cada uno es corregible con histórico (ADR-50, d5fb-05) y la tabla es dueña del aviso de RN-26.
 */
export function ClinicalAttributesTable({
  atributos,
  hoy,
  pacienteId,
  egresado,
  alGuardar,
  accion,
}: ClinicalAttributesTableProps) {
  const { caso, ficha } = mensajes();
  const c = caso.columnas;
  const correccion = useCorreccionEnTabla(alGuardar);
  return (
    <SeccionDeFicha id="caso-atributos" titulo={caso.secciones.atributos} accion={accion}>
      {atributos.length === 0 ? (
        <p className="m-0">{caso.sinDatos}</p>
      ) : (
        <table className="w-full border-collapse">
          <EncabezadoDeTabla
            columnas={[c.atributo, c.valor, c.fecha, c.origen]}
            columnaDeAcciones={ficha.biomarcadores.acciones}
          />
          {atributos.map((a) => (
            <FilaConHistorico
              key={a.id}
              columnas={4}
              accion={
                <DialogoAtributoClinico
                  pacienteId={pacienteId}
                  egresado={egresado}
                  corrige={a}
                  enfocarAlMontar={correccion.esReemplazo(a.supersedesId)}
                  alGuardar={correccion.alCorregir(a.id)}
                />
              }
              historico={
                a.supersedesId ? (
                  <HistoricoDelDato
                    dato={{ pacienteId, dato: 'clinical-attributes', id: a.id }}
                    hoy={hoy}
                  />
                ) : null
              }
            >
              <th scope="row" className={`${CELDA} font-semibold`}>
                {rotuloOValor(caso.atributosClave, a.key)}
              </th>
              <td className={CELDA}>{rotuloOValor(caso.valoresDeAtributo, a.value)}</td>
              <td className={CELDA}>
                <FechaRelativaOpcional fecha={a.observedAt} hoy={hoy} />
              </td>
              <td className={CELDA}>
                <ProcedenciaDelDato procedencia={a.provenance} />
              </td>
            </FilaConHistorico>
          ))}
        </table>
      )}
      {correccion.huboCorreccion && <AvisoAnalisisAnteriores />}
    </SeccionDeFicha>
  );
}
