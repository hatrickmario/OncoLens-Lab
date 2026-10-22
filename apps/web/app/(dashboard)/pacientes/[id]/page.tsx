import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert } from '../../../../components/ui/alert';
import { FichaDeAdministrador } from '../../../../components/organisms/ficha-de-administrador';
import { FichaDelDoctor } from '../../../../components/organisms/ficha-del-doctor';
import { mensajes, rellenar } from '../../../../lib/mensajes';
import { obtenerFicha, type ResultadoDeFicha } from '../../../../lib/server/pacientes';

export const metadata = { title: mensajes().ficha.tituloDocumento };

function Contenido({
  resultado,
}: {
  resultado: Exclude<ResultadoDeFicha, { tipo: 'no_autenticado' }>;
}) {
  const { ficha } = mensajes();
  if (resultado.tipo === 'no_encontrada') {
    return (
      <>
        <h1 className="m-0 mb-3 text-2xl font-semibold">{ficha.noEncontrado.titulo}</h1>
        <Link href="/pacientes" className="text-primary font-semibold">
          {ficha.noEncontrado.volver}
        </Link>
      </>
    );
  }
  if (resultado.tipo === 'error') {
    return (
      <Alert>
        {resultado.traceId === undefined
          ? ficha.errorSinTraza
          : rellenar(ficha.error, { traceId: resultado.traceId })}
      </Alert>
    );
  }
  return resultado.ficha.view === 'doctor' ? (
    <FichaDelDoctor ficha={resultado.ficha} />
  ) : (
    <FichaDeAdministrador ficha={resultado.ficha} />
  );
}

/** RSC: lee la ficha en el servidor (sin caché; identidad descifrada solo aquí); 401 → login con aviso de sesión expirada. */
export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resultado = await obtenerFicha((await headers()).get('cookie'), id);
  if (resultado.tipo === 'no_autenticado') {
    redirect('/login?motivo=expirada');
  }
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <Contenido resultado={resultado} />
    </main>
  );
}
