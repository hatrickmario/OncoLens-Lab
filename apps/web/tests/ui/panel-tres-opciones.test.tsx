// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidenciaTresOpciones,
  conEvidenciaTresOpcionesNoComparable,
  conEvidencia,
  crearBffAnalisisSimulado,
} from '../support/msw/evidence-analyses';
import { analizar } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();

const CRITERIO_APLICABILIDAD =
  'Orden por aplicabilidad: primero la opción con menos criterios excluyentes en No coincide; luego, la que coincide en más criterios con los datos registrados; la relevancia de recuperación solo desempata. Es un criterio de orden, no una valoración clínica.';
const NUMERACION =
  'La numeración indica la posición en el orden por aplicabilidad, no una preferencia.';
const NO_MOSTRADAS =
  'La evidencia describe 1 opción(es) más con soporte que no se muestran por el límite de 3, aplicado según el orden por aplicabilidad; el límite no es una valoración clínica de ellas. Una pregunta más específica puede mostrarlas.';
const BASE_DESEMPATA =
  'Metadato de recuperación; no mide solidez clínica ni probabilidad, y solo desempata el orden por aplicabilidad.';

const nombres = (cuerpo: { evidenceOptions: { option: string }[] }) =>
  cuerpo.evidenceOptions.map((o) => o.option);

async function listaDeOpciones() {
  const lista = await screen.findByRole('list', { name: /opciones descritas/i });
  return within(lista);
}

describe('EvidencePanel · hasta tres opciones (L1D-145)', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('conserva el orden recibido aunque la segunda opción tenga mayor relevanceScore [US-135 AC-4]', async () => {
    const [primera, segunda, tercera] = conEvidenciaTresOpciones.evidenceOptions;
    const cuerpo = {
      ...conEvidenciaTresOpciones,
      evidenceOptions: [primera, { ...segunda!, relevanceScore: 0.99 }, tercera],
    };
    bff.responder({ status: 200, cuerpo });
    await analizar();

    const lista = await listaDeOpciones();
    const visibles = lista.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(visibles).toEqual(nombres(cuerpo));
  });

  it('muestra la etiqueta Población no comparable y la tarjeta completa cuando la tercera opción lo es [US-135 AC-5]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaTresOpcionesNoComparable });
    await analizar();

    const lista = await listaDeOpciones();
    const tercera = lista.getAllByRole('listitem')[2]!;
    const opcion = conEvidenciaTresOpcionesNoComparable.evidenceOptions[2]!;
    expect(within(tercera).getByText('Población no comparable')).toBeTruthy();
    expect(within(tercera).getByText(opcion.rationale)).toBeTruthy();
    expect(within(tercera).getByRole('group', { name: /Coincide \d+, Parcial/ })).toBeTruthy();
    expect(within(tercera).getAllByRole('listitem').length).toBe(opcion.citedSources.length);
    expect(within(tercera).getByTestId('relevance-value').textContent).toBe('0,92');
  });

  it('rotula cada tarjeta como Opción descrita n de 3 dentro de una lista ordenada con h3 [US-135 AC-6]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaTresOpciones });
    await analizar();

    const lista = await screen.findByRole('list', { name: /opciones descritas/i });
    expect(lista.tagName).toBe('OL');
    const tarjetas = within(lista).getAllByRole('article');
    expect(tarjetas).toHaveLength(3);
    tarjetas.forEach((tarjeta, i) => {
      expect(within(tarjeta).getByRole('heading', { level: 3 })).toBeTruthy();
      expect(within(tarjeta).getByText(`Opción descrita ${i + 1} de 3`)).toBeTruthy();
    });
    expect(lista.textContent).not.toMatch(/mejor|primera elección|preferida/i);
  });

  it('muestra el texto de opciones no mostradas bajo la última tarjeta y lo añade al anuncio cuando optionsNotShown es 1 [US-135 AC-7]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaTresOpciones });
    await analizar();

    const texto = await screen.findByText(NO_MOSTRADAS);
    const tarjetas = screen.getAllByRole('article');
    expect(tarjetas[2]!.compareDocumentPosition(texto)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(within(texto.parentElement!).queryByRole('link')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('1 más con soporte no mostrada');
  });

  it('no muestra el texto de opciones no mostradas ni lo anuncia cuando optionsNotShown es 0 o está ausente [US-135 AC-7]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaTresOpcionesNoComparable });
    await analizar();
    await listaDeOpciones();
    expect(screen.queryByText(/opción\(es\) más con soporte/)).toBeNull();
    expect(screen.getByRole('status').textContent).not.toContain('no mostrada');
    cleanup();

    bff.responder({ status: 200, cuerpo: conEvidencia });
    await analizar();
    await screen.findAllByRole('article');
    expect(screen.queryByText(/opción\(es\) más con soporte/)).toBeNull();
    expect(screen.getByRole('status').textContent).not.toContain('no mostrada');
  });

  it('muestra el criterio de aplicabilidad una sola vez con la frase de numeración [US-135 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaTresOpciones });
    await analizar();

    await listaDeOpciones();
    expect(screen.getAllByText(CRITERIO_APLICABILIDAD)).toHaveLength(1);
    expect(screen.getAllByText(NUMERACION)).toHaveLength(1);
    expect(screen.getAllByTestId('relevance-basis')[0]!.textContent).toBe(BASE_DESEMPATA);
  });

  it('no muestra la frase de numeración cuando el criterio mostrado es el de relevancia [US-135 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    await analizar();

    await screen.findAllByRole('article');
    expect(screen.queryByText(NUMERACION)).toBeNull();
  });
});
