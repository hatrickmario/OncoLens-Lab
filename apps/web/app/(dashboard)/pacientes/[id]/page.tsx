import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FichaDeAdministrador } from '../../../../components/organisms/ficha-de-administrador';
import { FichaDelDoctor } from '../../../../components/organisms/ficha-del-doctor';
import { FichaNoDisponible } from '../../../../components/molecules/ficha-no-disponible';
import { mensajes } from '../../../../lib/mensajes';
import { hoyDelServidor } from '../../../../lib/server/hoy';
import { leerNotasDeLaFicha } from '../../../../lib/server/notas-de-la-ficha';
import { obtenerFicha, type ResultadoDeFicha } from '../../../../lib/server/pacientes';
import { RUTA_LOGIN_EXPIRADA } from '../../../../lib/sesion/motivo-de-sesion';
import type { ClinicalNote } from '../../../../../../packages/api-contracts/src/types/clinical-api';

export const metadata = { title: mensajes().ficha.tituloDocumento };

function Contenido({
  resultado,
  notas,
  hoy,
}: {
  resultado: Exclude<ResultadoDeFicha, { tipo: 'no_autenticado' }>;
  notas: ClinicalNote[] | null;
  hoy: string;
}) {
  if (resultado.tipo !== 'ok') return <FichaNoDisponible resultado={resultado} />;
  return resultado.ficha.view === 'doctor' ? (
    <FichaDelDoctor ficha={resultado.ficha} notas={notas} hoy={hoy} />
  ) : (
    <FichaDeAdministrador ficha={resultado.ficha} />
  );
}

/** RSC: lee la ficha en el servidor (sin caché; identidad descifrada solo aquí); 401 → login con aviso de sesión expirada. */
export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = (await headers()).get('cookie');
  const resultado = await obtenerFicha(cookie, id);
  if (resultado.tipo === 'no_autenticado') {
    redirect(RUTA_LOGIN_EXPIRADA);
  }
  const esDelDoctor = resultado.tipo === 'ok' && resultado.ficha.view === 'doctor';
  const notas = esDelDoctor ? await leerNotasDeLaFicha(cookie, id) : null;
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <Contenido resultado={resultado} notas={notas} hoy={hoyDelServidor()} />
    </main>
  );
}
