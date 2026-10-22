import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BusquedaDePacientes } from '../../../components/organisms/busqueda-de-pacientes';
import { ListadoDePacientes } from '../../../components/organisms/listado-de-pacientes';
import { mensajes } from '../../../lib/mensajes';
import { leerFiltros } from '../../../lib/pacientes/consulta';
import { leerListadoDePacientes } from '../../../lib/server/leer-listado-de-pacientes';

export const metadata = { title: mensajes().pacientes.tituloDocumento };

/** RSC: lee el listado en el servidor (sin caché, con identidad enmascarada); 401 → login con el aviso de sesión expirada. */
export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filtros = leerFiltros(await searchParams);
  const resultado = await leerListadoDePacientes((await headers()).get('cookie'), filtros);
  if (resultado.tipo === 'no_autenticado') {
    redirect('/login?motivo=expirada');
  }
  const { pacientes } = mensajes();
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <h1 className="m-0 mb-4 text-2xl font-semibold">{pacientes.titulo}</h1>
      <BusquedaDePacientes textos={pacientes}>
        <ListadoDePacientes resultado={resultado} filtros={filtros} textos={pacientes} />
      </BusquedaDePacientes>
    </main>
  );
}
