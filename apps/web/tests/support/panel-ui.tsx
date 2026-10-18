import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EvidencePanel } from '../../components/organisms/evidence-panel';
import { mensajes } from '../../lib/mensajes';
import { peticion } from './msw/evidence-analyses';

export const { evidence } = mensajes();

/** Pregunta de prueba de la UI (`[S1 resp. 36]`): la misma que `rag-query-request-solo-descartadas.json`. */
export const PREGUNTA_DE_PRUEBA =
  'En pacientes con cáncer de mama HER2 positivo temprano, ¿qué describe la evidencia sobre mortalidad con terapia anti-HER2 adyuvante?';

export const ID_PACIENTE = peticion.patientId;

export function montarPanel() {
  return render(<EvidencePanel patientId={ID_PACIENTE} />);
}

/** Escribe la pregunta y presiona "Analizar evidencia" como lo haría el oncólogo. */
export async function analizar(pregunta: string = PREGUNTA_DE_PRUEBA) {
  const usuario = userEvent.setup();
  montarPanel();
  await usuario.type(screen.getByLabelText(evidence.formulario.pregunta), pregunta);
  await usuario.click(screen.getByRole('button', { name: evidence.formulario.analizar }));
  return usuario;
}
