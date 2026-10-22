'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { PatientPage } from '../../../../packages/api-contracts/src/types/clinical-api';
import { buscarPacientes, type CriterioDeBusqueda } from '../../lib/pacientes/buscar-pacientes';
import { rellenar } from '../../lib/mensajes';
import type { TextosDePacientes } from '../../lib/pacientes/consulta';
import { mensajeDeBusqueda } from '../../lib/pacientes/mensaje-de-busqueda';
import { FormularioDeBusqueda } from '../molecules/formulario-de-busqueda';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { TablaDePacientes } from './tabla-de-pacientes';

export interface BusquedaDePacientesProps {
  textos: TextosDePacientes;
  /** El listado (RSC); se oculta mientras hay resultados de una búsqueda. */
  children: ReactNode;
}

type Estado =
  | { fase: 'inactiva' }
  | { fase: 'buscando' }
  | { fase: 'resultado'; items: PatientPage['items']; aviso: string }
  | { fase: 'error'; traceId?: string };

/** Búsqueda de pacientes por el BFF (POST con la identidad en el cuerpo); sustituye al listado mientras hay resultado. */
export function BusquedaDePacientes({ textos, children }: BusquedaDePacientesProps) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: 'inactiva' });
  const [version, setVersion] = useState(0);
  const { busqueda } = textos;

  async function buscar(criterio: CriterioDeBusqueda) {
    setEstado({ fase: 'buscando' });
    const resultado = await buscarPacientes(criterio);
    if (resultado.tipo === 'no_autenticado') {
      router.replace('/login?motivo=expirada');
    } else if (resultado.tipo === 'error') {
      setEstado({ fase: 'error', ...(resultado.traceId && { traceId: resultado.traceId }) });
    } else {
      const { pagina } = resultado;
      const aviso = mensajeDeBusqueda(criterio, pagina, busqueda);
      setEstado({ fase: 'resultado', items: pagina.items, aviso });
    }
  }

  function limpiar() {
    setEstado({ fase: 'inactiva' });
    setVersion(version + 1);
  }

  return (
    <>
      <FormularioDeBusqueda
        key={version}
        textos={textos}
        buscando={estado.fase === 'buscando'}
        onBuscar={buscar}
      />
      <div role="status" aria-busy={estado.fase === 'buscando'}>
        {estado.fase === 'resultado' ? estado.aviso : ''}
      </div>
      {estado.fase === 'error' && (
        <Alert>
          {estado.traceId === undefined
            ? busqueda.errorSinTraza
            : rellenar(busqueda.error, { traceId: estado.traceId })}
        </Alert>
      )}
      {estado.fase === 'resultado' && estado.items.length > 0 && (
        <TablaDePacientes items={estado.items} textos={textos} />
      )}
      {estado.fase === 'inactiva' || estado.fase === 'buscando' ? (
        children
      ) : (
        <Button variante="secundario" onClick={limpiar} className="mt-3">
          {busqueda.limpiar}
        </Button>
      )}
    </>
  );
}
