import { render, screen } from '@testing-library/react';
import { expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ConversationPanel } from '../../components/organisms/conversation-panel';
import { mensajes } from '../../lib/mensajes';
import { peticion } from './msw/evidence-analyses';

export const { evidence } = mensajes();
const { conversacion } = mensajes();

/** Pregunta de prueba de la UI (`[S1 resp. 36]`): la misma que `rag-query-request-solo-descartadas.json`. */
export const PREGUNTA_DE_PRUEBA =
  'En pacientes con cáncer de mama HER2 positivo temprano, ¿qué describe la evidencia sobre mortalidad con terapia anti-HER2 adyuvante?';

/** Nombre de los títulos de nivel 3 que no son la Base del análisis (p. ej. las tarjetas de opción). */
export const SIN_BASE = /^(?!Base del análisis$)/;

export const ID_PACIENTE = peticion.patientId;

/** Monta el panel conversacional (US-267); el análisis llega como turno de evidencia (`msw/evidence-analyses`). */
export function montarPanel() {
  return render(<ConversationPanel patientId={ID_PACIENTE} />);
}

/** Escribe la pregunta y pulsa «Preguntar» como lo haría el oncólogo; el resultado sale en la tarjeta del turno. */
export async function analizar(pregunta: string = PREGUNTA_DE_PRUEBA) {
  const usuario = userEvent.setup();
  montarPanel();
  await usuario.type(screen.getByLabelText(conversacion.campo), pregunta);
  await usuario.click(screen.getByRole('button', { name: conversacion.preguntar }));
  return usuario;
}

/** RN-26: tras un resultado con avisos el campo y «Preguntar» siguen operables (se escribe otra pregunta y se habilitan). */
export async function esperarComposerOperable(usuario: ReturnType<typeof userEvent.setup>) {
  const campo = screen.getByLabelText(conversacion.campo) as HTMLTextAreaElement;
  await usuario.type(campo, 'Otra pregunta');
  expect(campo.disabled).toBe(false);
  expect(
    (screen.getByRole('button', { name: conversacion.preguntar }) as HTMLButtonElement).disabled,
  ).toBe(false);
}
