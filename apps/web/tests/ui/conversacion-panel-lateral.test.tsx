// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  casoDelPaciente,
  crearBffConversacionSimulado,
  historicoDeBiomarcador,
  turnoDeCaso,
} from '../support/msw/conversaciones';
import { cuantasTarjetas, ID_PACIENTE, mostrarTurno, textos } from '../support/conversacion-ui';
import { turnoDeEvidenciaConFuentes } from '../support/turno-con-fuentes';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffConversacionSimulado();
const ID_HER2 = turnoDeCaso.dataLinks[1]!.resourceId;

describe('Panel lateral del chat', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('abre el fragmento con sus metadatos y al cerrar con Esc conserva el borrador y devuelve el foco a la cita [US-268 AC-1]', async () => {
    const turno = { ...turnoDeEvidenciaConFuentes(), id: turnoDeCaso.id };
    const { usuario, tarjeta } = await mostrarTurno(bff, turno);
    const campo = screen.getByLabelText(textos.campo);
    await usuario.type(campo, '¿Qué población estudió la fuente?');
    const urlAntes = window.location.href;

    const cita = within(tarjeta).getByRole('button', { name: /^\[E1 · frag\. 5\]/ });
    await usuario.click(cita);

    const panel = await screen.findByRole('dialog', { name: 'Fragmento citado' });
    expect(within(panel).getByText(/Adding anti-HER2 therapy|anti-HER2/)).toBeTruthy();
    expect(within(panel).getByText(/Breast Cancer Treatment/)).toBeTruthy();
    expect(within(panel).getByText('NCI PDQ')).toBeTruthy();
    expect(window.location.href).toBe(urlAntes);
    expect(cuantasTarjetas()).toBe(1);

    await usuario.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((screen.getByLabelText(textos.campo) as HTMLTextAreaElement).value).toBe(
      '¿Qué población estudió la fuente?',
    );
    expect(document.activeElement).toBe(cita);
    expect(cuantasTarjetas()).toBe(1);
  });

  it('abre el dato con su origen y el histórico con la versión reemplazada sin salir de la página [US-268 AC-2]', async () => {
    bff.responderCaso({ status: 200, cuerpo: casoDelPaciente });
    bff.responderHistorico({ status: 200, cuerpo: historicoDeBiomarcador });
    const { usuario, tarjeta } = await mostrarTurno(bff, turnoDeCaso);
    const urlAntes = window.location.href;

    await usuario.click(
      within(tarjeta).getByRole('button', { name: /Biomarcador.*Ver en el caso/ }),
    );

    const panel = await screen.findByRole('dialog', { name: 'Dato del paciente' });
    expect(
      within(panel).getByText('En la respuesta (generada por IA; ver los avisos del turno)'),
    ).toBeTruthy();
    expect(within(panel).getByText(/HER2: 3\+/)).toBeTruthy();
    expect(within(panel).getByText(/Documento/)).toBeTruthy();
    const historico = await within(panel).findByRole('list', { name: 'Versiones anteriores' });
    expect(within(historico).getAllByText('reemplazado')).toHaveLength(2);
    expect(within(historico).getByText('25 %')).toBeTruthy();
    expect(bff.historicos).toHaveLength(1);
    expect(new URL(bff.historicos[0]!).pathname).toBe(
      `/api/patients/${ID_PACIENTE}/biomarkers/${ID_HER2}/history`,
    );
    expect(window.location.href).toBe(urlAntes);
    expect(cuantasTarjetas()).toBe(1);
    const completa = within(panel).getByRole('link', {
      name: 'Abrir la vista de caso completa (abre en nueva pestaña)',
    });
    expect(completa.getAttribute('target')).toBe('_blank');
    expect(completa.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('muestra solo el origen y no pide el histórico cuando el dato es un diagnóstico', async () => {
    bff.responderCaso({ status: 200, cuerpo: casoDelPaciente });
    const { usuario, tarjeta } = await mostrarTurno(bff, turnoDeCaso);

    await usuario.click(
      within(tarjeta).getByRole('button', { name: /Diagnóstico.*Ver en el caso/ }),
    );

    const panel = await screen.findByRole('dialog', { name: 'Dato del paciente' });
    expect(within(panel).getByText(/Carga inicial/)).toBeTruthy();
    expect(within(panel).queryByRole('list', { name: 'Versiones anteriores' })).toBeNull();
    expect(bff.historicos).toHaveLength(0);
  });

  it('muestra No se pudo cargar el dato con Reintentar y deja la conversación intacta cuando la lectura del caso falla', async () => {
    bff.responderCaso({ status: 503, cuerpo: { error: 'SERVICIO_NO_DISPONIBLE' } });
    const { usuario, tarjeta } = await mostrarTurno(bff, turnoDeCaso);
    await usuario.type(screen.getByLabelText(textos.campo), 'borrador');

    await usuario.click(
      within(tarjeta).getByRole('button', { name: /Biomarcador.*Ver en el caso/ }),
    );

    const panel = await screen.findByRole('dialog', { name: 'Dato del paciente' });
    expect(await within(panel).findByText('No se pudo cargar el dato')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect(panel.textContent).not.toMatch(/503|SERVICIO_NO_DISPONIBLE/);
    await usuario.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((screen.getByLabelText(textos.campo) as HTMLTextAreaElement).value).toBe('borrador');
    expect(cuantasTarjetas()).toBe(1);
  });
});
