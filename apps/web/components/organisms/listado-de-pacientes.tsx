import type { FiltrosDelListado, TextosDePacientes } from '../../lib/pacientes/consulta';
import { rellenar } from '../../lib/mensajes';
import type { ResultadoDePacientes } from '../../lib/pacientes/respuesta';
import { Alert } from '../ui/alert';
import { FiltrosDePacientes } from '../molecules/filtros-de-pacientes';
import { Paginacion } from '../molecules/paginacion';
import { TablaDePacientes } from './tabla-de-pacientes';

export interface ListadoDePacientesProps {
  resultado: Exclude<ResultadoDePacientes, { tipo: 'no_autenticado' }>;
  filtros: FiltrosDelListado;
  textos: TextosDePacientes;
}

function mensajeDeError(traceId: string | undefined, textos: TextosDePacientes['listado']) {
  return traceId === undefined ? textos.errorSinTraza : rellenar(textos.error, { traceId });
}

/** Listado del servidor: filtros, tabla y paginación; vacío y error con su texto (el aviso nunca bloquea, RN-26). */
export function ListadoDePacientes({ resultado, filtros, textos }: ListadoDePacientesProps) {
  if (resultado.tipo === 'error') {
    return <Alert>{mensajeDeError(resultado.traceId, textos.listado)}</Alert>;
  }
  const { items, page, pageSize, total } = resultado.pagina;
  const conFiltros = filtros.status !== undefined || filtros.dataOrigin !== undefined;
  return (
    <section aria-label={textos.titulo}>
      <FiltrosDePacientes filtros={filtros} textos={textos} />
      {items.length === 0 ? (
        <p>{conFiltros ? textos.listado.sinCoincidencias : textos.listado.vacio}</p>
      ) : (
        <>
          <TablaDePacientes items={items} textos={textos} />
          <Paginacion
            pagina={page}
            pageSize={pageSize}
            total={total}
            filtros={filtros}
            textos={textos}
          />
        </>
      )}
    </section>
  );
}
