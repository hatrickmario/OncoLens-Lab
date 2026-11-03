import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { FichaNoDisponible } from '../../../../../components/molecules/ficha-no-disponible';
import { PatientHeaderBar } from '../../../../../components/organisms/patient-header-bar';
import { VistaDeCaso } from '../../../../../components/organisms/vista-de-caso';
import { CaseViewTemplate } from '../../../../../components/templates/case-view-template';
import { hrefDeFicha } from '../../../../../lib/ficha/anclas';
import { mensajes } from '../../../../../lib/mensajes';
import { hoyDelServidor } from '../../../../../lib/server/hoy';
import { obtenerFicha } from '../../../../../lib/server/pacientes';
import { RUTA_LOGIN_EXPIRADA } from '../../../../../lib/sesion/motivo-de-sesion';

export const metadata = { title: mensajes().caso.tituloDocumento };

/**
 * RSC de `/pacientes/{id}/caso` (D1): valida el UUID y lee la ficha para la barra del paciente (identidad solo aquí,
 * nunca en la URL ni en el estado cliente); la vista de caso la pide el organismo cliente al Route Handler. El
 * administrador no lee datos clínicos: vuelve a su ficha.
 */
export default async function CasoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resultado = await obtenerFicha((await headers()).get('cookie'), id);
  if (resultado.tipo === 'no_autenticado') redirect(RUTA_LOGIN_EXPIRADA);
  if (resultado.tipo !== 'ok') {
    return (
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <FichaNoDisponible resultado={resultado} />
      </main>
    );
  }
  if (resultado.ficha.view !== 'doctor') redirect(hrefDeFicha(id));
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <PatientHeaderBar ficha={resultado.ficha} />
      <CaseViewTemplate patientId={id}>
        <VistaDeCaso patientId={id} hoy={hoyDelServidor()} />
      </CaseViewTemplate>
    </main>
  );
}
