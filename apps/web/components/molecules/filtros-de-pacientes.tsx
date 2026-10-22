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

type ClaveDeFiltro = 'status' | 'dataOrigin';
const CLAVES: readonly ClaveDeFiltro[] = ['status', 'dataOrigin'];

/** Opciones de un grupo: "Todos" (quita la clave) y cada valor; elegir cualquiera vuelve a la página 1. */
function opcionesDelGrupo(
  clave: ClaveDeFiltro,
  valores: readonly (readonly [string, string])[],
  filtros: FiltrosDelListado,
  etiquetaTodos: string,
): OpcionDeFiltro[] {
  const sinClave: FiltrosDelListado = {};
  for (const otra of CLAVES.filter((c) => c !== clave)) {
    if (filtros[otra] !== undefined) Object.assign(sinClave, { [otra]: filtros[otra] });
  }
  return [
    { etiqueta: etiquetaTodos, destino: sinClave, vigente: filtros[clave] === undefined },
    ...valores.map(([valor, etiqueta]) => ({
      etiqueta,
      destino: { ...sinClave, [clave]: valor } as FiltrosDelListado,
      vigente: filtros[clave] === valor,
    })),
  ];
}

/** Estado y origen del listado como enlaces con query (RSC): sin identidad, sí en la URL; la página se reinicia. */
export function FiltrosDePacientes({ filtros, textos }: FiltrosDePacientesProps) {
  const { filtros: t } = textos;
  const estados = Object.entries(textos.estados);
  const origenes = Object.entries(textos.filtroOrigenes);
  return (
    <div aria-label={t.etiqueta} role="group" className="mb-4 flex flex-wrap gap-6">
      <Grupo titulo={t.estado} opciones={opcionesDelGrupo('status', estados, filtros, t.todos)} />
      <Grupo
        titulo={t.origen}
        opciones={opcionesDelGrupo('dataOrigin', origenes, filtros, t.todos)}
      />
    </div>
  );
}
