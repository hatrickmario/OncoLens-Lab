import Link from 'next/link';
import {
  hrefDelListado,
  type FiltrosDelListado,
  type TextosDePacientes,
} from '../../lib/pacientes/consulta';
import { rellenar } from '../../lib/mensajes';

export interface PaginacionProps {
  pagina: number;
  pageSize: number;
  total: number;
  filtros: FiltrosDelListado;
  textos: TextosDePacientes;
}

const ENLACE =
  'rounded-control border-control-border bg-surface text-primary inline-flex min-h-11 items-center border px-4 font-semibold';

/** "Página n de m" con Anterior/Siguiente como enlaces que conservan los filtros (el tamaño lo fija la configuración). */
export function Paginacion({ pagina, pageSize, total, filtros, textos }: PaginacionProps) {
  const paginas = Math.max(1, Math.ceil(total / pageSize));
  const hacia = (destino: number) => hrefDelListado({ ...filtros, page: destino });
  return (
    <nav aria-label={textos.paginacion.etiqueta} className="mt-4 flex items-center gap-4">
      {pagina > 1 && (
        <Link href={hacia(pagina - 1)} className={ENLACE}>
          {textos.paginacion.anterior}
        </Link>
      )}
      <span>{rellenar(textos.paginacion.pagina, { n: pagina, m: paginas })}</span>
      {pagina < paginas && (
        <Link href={hacia(pagina + 1)} className={ENLACE}>
          {textos.paginacion.siguiente}
        </Link>
      )}
    </nav>
  );
}
