import Link from 'next/link';
import {
  hrefDelListado,
  type FiltrosDelListado,
  type TextosDePacientes,
} from '../../lib/pacientes/consulta';
import { cn } from '../../lib/utils';

export interface FiltrosDePacientesProps {
  filtros: FiltrosDelListado;
  textos: TextosDePacientes;
}

interface OpcionDeFiltro {
  etiqueta: string;
  /** Filtros que resultan de elegirla; cambiar un filtro vuelve a la página 1. */
  destino: FiltrosDelListado;
  vigente: boolean;
}

function Grupo({ titulo, opciones }: { titulo: string; opciones: OpcionDeFiltro[] }) {
  return (
    <div role="group" aria-label={titulo} className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">{titulo}</span>
      {opciones.map(({ etiqueta, destino, vigente }) => (
        <Link
          key={etiqueta}
          href={hrefDelListado(destino)}
          aria-current={vigente ? 'true' : undefined}
          className={cn(
            'rounded-control border-control-border text-primary inline-flex min-h-11 items-center border px-3',
            vigente && 'bg-primary border-primary font-semibold text-white',
          )}
        >
          {etiqueta}
        </Link>
      ))}
    </div>
  );
}

function sinPagina({ status, dataOrigin }: FiltrosDelListado): FiltrosDelListado {
  return { ...(status && { status }), ...(dataOrigin && { dataOrigin }) };
}

/** Estado y origen del listado como enlaces con query (RSC): sin identidad, sí en la URL; la página se reinicia. */
export function FiltrosDePacientes({ filtros, textos }: FiltrosDePacientesProps) {
  const base = sinPagina(filtros);
  const { status, ...sinEstado } = base;
  const { dataOrigin, ...sinOrigen } = base;
  const estados = [
    ['activo', textos.estados.activo],
    ['egresado', textos.estados.egresado],
  ] as const;
  const origenes = Object.entries(textos.filtroOrigenes) as [
    NonNullable<FiltrosDelListado['dataOrigin']>,
    string,
  ][];
  return (
    <div aria-label={textos.filtros.etiqueta} role="group" className="mb-4 flex flex-wrap gap-6">
      <Grupo
        titulo={textos.filtros.estado}
        opciones={[
          { etiqueta: textos.filtros.todos, destino: sinEstado, vigente: status === undefined },
          ...estados.map(([valor, etiqueta]) => ({
            etiqueta,
            destino: { ...sinEstado, status: valor },
            vigente: status === valor,
          })),
        ]}
      />
      <Grupo
        titulo={textos.filtros.origen}
        opciones={[
          { etiqueta: textos.filtros.todos, destino: sinOrigen, vigente: dataOrigin === undefined },
          ...origenes.map(([valor, etiqueta]) => ({
            etiqueta,
            destino: { ...sinOrigen, dataOrigin: valor },
            vigente: dataOrigin === valor,
          })),
        ]}
      />
    </div>
  );
}
