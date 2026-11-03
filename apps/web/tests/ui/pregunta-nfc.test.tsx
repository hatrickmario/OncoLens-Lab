// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import tabla from '../../../../packages/clinical-language/fixtures/normalizacion-pregunta.json';
import { conEvidencia, crearBffAnalisisSimulado } from '../support/msw/evidence-analyses';
import { evidence, montarPanel } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();

const PREGUNTA_DEMO_4 = tabla.casos.find((c) =>
  c.nombre.startsWith('pasa a NFC la pregunta de la Demo 4'),
)!;

async function pegarYEnviar(pregunta: string) {
  const usuario = userEvent.setup();
  montarPanel();
  await usuario.click(screen.getByLabelText(evidence.formulario.pregunta));
  await usuario.paste(pregunta);
  await usuario.click(screen.getByRole('button', { name: evidence.formulario.analizar }));
}

describe('EvidencePanel · pregunta normalizada (US-250)', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('envía la pregunta en NFC cuando el oncólogo pega la de la Demo 4 en NFD [US-250 AC-1]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    expect(PREGUNTA_DEMO_4.entrada).not.toBe(PREGUNTA_DEMO_4.entrada.normalize('NFC'));

    await pegarYEnviar(PREGUNTA_DEMO_4.entrada);

    await waitFor(() => expect(bff.cuerpos).toHaveLength(1));
    const { query } = bff.cuerpos[0] as { query: string };
    expect(Buffer.from(query, 'utf8').equals(Buffer.from(PREGUNTA_DEMO_4.esperada, 'utf8'))).toBe(
      true,
    );
    const campo = screen.getByLabelText(evidence.formulario.pregunta) as HTMLTextAreaElement;
    expect(campo.value).toBe(PREGUNTA_DEMO_4.entrada);
  });

  it('no muestra el error de máximo y envía 2000 caracteres NFC cuando el NFD supera 2000 [US-250 AC-3]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    const nfc = String.fromCodePoint(0xe9).repeat(2000);
    const nfd = nfc.normalize('NFD');
    expect(nfd.length).toBeGreaterThan(2000);

    await pegarYEnviar(nfd);

    await waitFor(() => expect(bff.cuerpos).toHaveLength(1));
    expect((bff.cuerpos[0] as { query: string }).query).toBe(nfc);
    expect(screen.queryByText('La pregunta admite como máximo 2000 caracteres.')).toBeNull();
  });
});
