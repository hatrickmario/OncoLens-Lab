// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { esUrlHttpSegura } from '../../lib/evidence/procedencia';
import { crearBffConversacionSimulado } from '../support/msw/conversaciones';
import { FragmentoCitadoEnPanel } from '../../components/molecules/fragmento-citado-en-panel';
import { ReferenciasDelTurno } from '../../components/molecules/referencias-del-turno';
import { fragmentoDeFuente } from '../../lib/conversacion/fragmento-abierto';
import { cuantasTarjetas, mostrarTurno, textos, turnoCon } from '../support/conversacion-ui';
import { turnoDeEvidenciaConFuentes } from '../support/turno-con-fuentes';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffConversacionSimulado();
const HOSTIL = 'Resultado <img src=x onerror="window.__xss=1"> y [enlace](javascript:alert(1))';

function enlacesConHref(raiz: HTMLElement): HTMLAnchorElement[] {
  return [...raiz.querySelectorAll<HTMLAnchorElement>('a[href]')];
}

describe('Referencias del turno y fragmento en el panel lateral', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('lista las tres referencias con metadatos, No disponible en los ausentes y enlaces en otra pestaña [US-268 AC-4]', async () => {
    const { usuario, tarjeta } = await mostrarTurno(bff, turnoCon(turnoDeEvidenciaConFuentes()));

    await usuario.click(within(tarjeta).getByText('Ver referencias'));

    const lista = within(tarjeta).getByRole('list', { name: 'Referencias del turno' });
    const referencias = within(lista).getAllByRole('listitem');
    expect(referencias).toHaveLength(3);
    expect(within(referencias[0]!).getByText('Autores').nextElementSibling?.textContent).toBe(
      'No disponible',
    );
    expect(within(referencias[1]!).getByText('Autora Sintética B')).toBeTruthy();
    const enlaces = enlacesConHref(lista);
    expect(enlaces.length).toBeGreaterThanOrEqual(3);
    for (const enlace of enlaces) {
      expect(enlace.getAttribute('target')).toBe('_blank');
      expect(enlace.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('no crea enlace con href para una referencia con sourceUrl javascript: en Ver referencias ni en el panel lateral de la cita [US-268 AC-5]', async () => {
    // El contrato ya rechaza un `sourceUrl` que no sea https (zEvidenceAnalysis): este es el cinturón de la propia UI.
    const hostil = {
      ...turnoDeEvidenciaConFuentes().evidenceAnalysis.evidenceOptions[0].citedSources[0],
      sourceUrl: 'javascript:alert(1)',
    };
    render(
      <>
        <ReferenciasDelTurno fuentes={[hostil]} />
        <FragmentoCitadoEnPanel fuente={{ ...fragmentoDeFuente(hostil), fuente: hostil }} />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Ver referencias' }));

    expect(enlacesConHref(document.body)).toHaveLength(0);
    expect(screen.getAllByText(/Breast Cancer Treatment/).length).toBeGreaterThanOrEqual(2);
  });

  it.each(['javascript:alert(1)', 'http://inseguro.example/doc', 'ftp://servidor.test/doc'])(
    'no enlaza la fuente y muestra No disponible en el panel lateral cuando la URL no es https segura (%s) [ARR-07 AC-4]',
    (sourceUrl) => {
      const fuente = {
        ...turnoDeEvidenciaConFuentes().evidenceAnalysis.evidenceOptions[0].citedSources[0],
        sourceUrl,
      };
      render(<FragmentoCitadoEnPanel fuente={fragmentoDeFuente(fuente)} />);

      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByText('Fuente original').nextElementSibling?.textContent).toBe(
        'No disponible',
      );
    },
  );

  it('muestra el error del turno y ningún enlace cuando el contrato rechaza un sourceUrl javascript:', async () => {
    const turno = turnoCon(
      turnoDeEvidenciaConFuentes({ cambiosPorFuente: [{ sourceUrl: 'javascript:alert(1)' }] }),
    );
    await mostrarTurno(bff, turno).catch(() => undefined);

    expect(await screen.findByText(textos.errorTitulo)).toBeTruthy();
    expect(cuantasTarjetas()).toBe(0);
    expect(enlacesConHref(document.body)).toHaveLength(0);
  });

  it('no crea img ni script ni manejador cuando el fragmento trae HTML hostil en el panel lateral [US-268 AC-5]', async () => {
    const turno = turnoCon(turnoDeEvidenciaConFuentes({ textoDelFragmento: HOSTIL }));
    const { usuario, tarjeta } = await mostrarTurno(bff, turno);

    await usuario.click(within(tarjeta).getByRole('button', { name: /^\[E1 · frag\. 5\]/ }));

    const panel = await screen.findByRole('dialog');
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('script')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    expect(panel.textContent).toContain('<img src=x');
    for (const enlace of enlacesConHref(panel)) {
      expect(esUrlHttpSegura(enlace.getAttribute('href'))).toBe(true);
    }
  });
});
