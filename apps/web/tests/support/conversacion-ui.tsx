import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ConversationPanel,
  type ConversationPanelProps,
} from '../../components/organisms/conversation-panel';
import { mensajes } from '../../lib/mensajes';
import { idDeTurnoDePrueba } from './id-de-turno';
import { apertura, turnoDeCaso, type RespuestaDeTurno } from './msw/conversaciones';

export const textos = mensajes().conversacion;

/** La tarjeta de un turno es un grupo con nombre «Turno n»: `article` ya lo usan las tarjetas de opción del análisis. */
const TARJETA_DE_TURNO = { name: /^Turno \d+$/ };
export const tarjetas = () => screen.getAllByRole('group', TARJETA_DE_TURNO);
export const buscarTarjetas = () => screen.findAllByRole('group', TARJETA_DE_TURNO);
export const cuantasTarjetas = () => screen.queryAllByRole('group', TARJETA_DE_TURNO).length;
export const ID_PACIENTE = apertura.patientId;

export function montarPanel(props: Partial<ConversationPanelProps> = {}) {
  return render(<ConversationPanel patientId={ID_PACIENTE} {...props} />);
}

/** Escribe la pregunta y pulsa «Preguntar» como lo haría el oncólogo. */
export async function preguntar(
  usuario: ReturnType<typeof userEvent.setup>,
  texto: string,
): Promise<void> {
  await usuario.type(screen.getByLabelText(textos.campo), texto);
  await usuario.click(screen.getByRole('button', { name: textos.preguntar }));
}

/**
 * Un turno del contrato con el sobre de `conversation-turn.json` y la carga (`intent`, `blocks`, `notices`…) de un
 * ejemplo `chat-turn-*.json` de Backend 2: así el test no inventa campos fuera de `contracts/examples/`.
 */
export function turnoCon(carga: object, cambios: Record<string, unknown> = {}, numero = 1) {
  // El id es único por turno: assistant-ui descarta mensajes con el mismo id.
  const id = idDeTurnoDePrueba(numero);
  return { ...turnoDeCaso, id, turnNumber: numero, dataLinks: [], ...carga, ...cambios };
}

export const respuestaDeTurno = (cuerpo: object, status = 201): RespuestaDeTurno => ({
  status,
  cuerpo,
});

/** Monta el panel, envía una pregunta y espera a que aparezca la tarjeta del asistente. */
export async function mostrarTurno(
  bff: { responderTurnos: (...r: RespuestaDeTurno[]) => void },
  turno: object,
) {
  bff.responderTurnos(respuestaDeTurno(turno));
  const usuario = userEvent.setup();
  montarPanel();
  await preguntar(usuario, '¿Cuál es la situación actual de la paciente?');
  return { usuario, tarjeta: (await buscarTarjetas())[0]! };
}
