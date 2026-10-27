// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import origen from '../../../../packages/clinical-language/origen-de-campos.json';
import {
  conEvidencia,
  conEvidenciaSinOpciones,
  conEvidenciaSoloDescartadas,
  crearBffAnalisisSimulado,
  peticion,
} from '../support/msw/evidence-analyses';
import {
  analizar,
  evidence,
  ID_PACIENTE,
  montarPanel,
  PREGUNTA_DE_PRUEBA,
  SIN_BASE,
} from '../support/panel-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearBffAnalisisSimulado();
const opcion = conEvidencia.evidenceOptions[0]!;
const cita = opcion.citedSources[0]!;
const descartada = conEvidenciaSoloDescartadas.discardedOptions[0]!;

describe('EvidencePanel', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    replace.mockReset();
  });

  it('muestra bajo Opciones descritas en la evidencia la opción, su justificación y un chip NCI PDQ con su externalId, sin cambiar de URL, cuando el oncólogo presiona Analizar evidencia [US-061 AC-1]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    const urlAntes = window.location.href;

    const usuario = await analizar();

    expect(
      await screen.findByRole('heading', { level: 2, name: evidence.resultado.encabezado }),
    ).toBeTruthy();
    expect(bff.cuerpos).toEqual([
      {
        patientId: ID_PACIENTE,
        query: PREGUNTA_DE_PRUEBA,
        continueWithWarning: false,
        sourcesSelected: { guias: true, ensayos: true, publicaciones: true },
      },
    ]);
    expect(screen.getByRole('heading', { level: 3, name: opcion.option })).toBeTruthy();
    expect(screen.getByText(opcion.rationale)).toBeTruthy();
    const chip = screen.getByRole('button', {
      name: new RegExp(`${cita.sourceName}.*${cita.externalId}`),
    });
    expect(window.location.href).toBe(urlAntes);

    await usuario.click(chip);
    const autores = screen.getByText(evidence.cita.autores).nextElementSibling;
    expect(autores?.textContent).toBe(evidence.cita.noDisponible);
    await usuario.click(screen.getByRole('button', { name: evidence.cita.verFragmento }));
    const fragmento = within(
      screen.getByRole('complementary', { name: evidence.fragmento.titulo }),
    );
    expect(fragmento.getByText(cita.chunkTextSnapshot).getAttribute('lang')).toBe(cita.language);
  });

  it('muestra al final del Fragmento citado el enlace a la fuente original en una pestaña nueva cuando la cita trae una URL https [ARR-07 AC-4]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    const usuario = await analizar();
    await usuario.click(await screen.findByRole('button', { name: new RegExp(cita.externalId) }));
    await usuario.click(screen.getByRole('button', { name: evidence.cita.verFragmento }));

    const panel = screen.getByRole('complementary', { name: evidence.fragmento.titulo });
    const enlace = within(panel).getByRole('link', { name: cita.sourceUrl! });
    expect(enlace.getAttribute('href')).toBe(cita.sourceUrl);
    expect(enlace.getAttribute('target')).toBe('_blank');
    expect(enlace.getAttribute('rel')).toBe('noopener noreferrer');
    expect(within(panel).getByText(evidence.cita.fuenteOriginal)).toBeTruthy();
    const botonVolver = within(panel).getByRole('button', { name: evidence.fragmento.volver });
    const orden = enlace.compareDocumentPosition(botonVolver);
    expect(orden & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([null])(
    'muestra No disponible en lugar del enlace en el Fragmento citado cuando la fuente no registra URL (%s) [ARR-07 AC-4]',
    async (sourceUrl) => {
      const sinUrl = structuredClone(conEvidencia);
      (sinUrl.evidenceOptions[0]!.citedSources[0]! as { sourceUrl: string | null }).sourceUrl =
        sourceUrl;
      bff.responder({ status: 200, cuerpo: sinUrl });
      const usuario = await analizar();
      await usuario.click(await screen.findByRole('button', { name: new RegExp(cita.externalId) }));
      await usuario.click(screen.getByRole('button', { name: evidence.cita.verFragmento }));

      const panel = within(screen.getByRole('complementary', { name: evidence.fragmento.titulo }));
      expect(panel.queryByRole('link')).toBeNull();
      expect(panel.getByText(evidence.cita.fuenteOriginal).nextElementSibling?.textContent).toBe(
        evidence.cita.noDisponible,
      );
    },
  );

  it('muestra el resumen y un control Ver más detalle cerrado que al abrirse revela los párrafos de detalle cuando la opción los trae [ARR-08 AC-4]', async () => {
    const conDetalle = structuredClone(conEvidencia);
    (conDetalle.evidenceOptions[0] as { details?: string[] }).details = [
      'Primer párrafo de detalle sobre el diseño del estudio.',
      'Segundo párrafo de detalle sobre los resultados reportados.',
    ];
    bff.responder({ status: 200, cuerpo: conDetalle });
    const usuario = await analizar();

    const resumen = await screen.findByText(evidence.detalle.resumen);
    const detalle = resumen.closest('details') as HTMLDetailsElement;
    expect(detalle.open).toBe(false);
    expect(screen.getByText(opcion.rationale)).toBeTruthy();
    expect(detalle.contains(screen.getByText(opcion.rationale))).toBe(false);

    await usuario.click(resumen);

    expect(detalle.open).toBe(true);
    expect(
      within(detalle)
        .getAllByRole('paragraph')
        .map((p) => p.textContent),
    ).toEqual([
      'Primer párrafo de detalle sobre el diseño del estudio.',
      'Segundo párrafo de detalle sobre los resultados reportados.',
    ]);
  });

  it('no muestra el control Ver más detalle cuando la opción no trae details [ARR-08 AC-4]', async () => {
    const sinDetalle = structuredClone(conEvidencia);
    delete (sinDetalle.evidenceOptions[0] as { details?: string[] }).details;
    bff.responder({ status: 200, cuerpo: sinDetalle });
    await analizar();

    await screen.findByText(opcion.rationale);
    expect(screen.queryByText(evidence.detalle.resumen)).toBeNull();
    expect(document.querySelector('details')).toBeNull();
  });

  it('marca con data-origen solo las hojas copiadas del corpus y nunca el texto generado cuando se expande la cita [US-061 AC-1]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    const usuario = await analizar();
    await usuario.click(await screen.findByRole('button', { name: new RegExp(cita.externalId) }));
    await usuario.click(screen.getByRole('button', { name: evidence.cita.verFragmento }));

    const marcados = [...document.querySelectorAll('[data-origen]')];
    const campos = new Set(marcados.map((nodo) => nodo.getAttribute('data-campo')));
    expect(campos).toEqual(new Set(['sourceName', 'externalId', 'title', 'chunkTextSnapshot']));
    for (const nodo of marcados) {
      const campo = nodo.getAttribute('data-campo') ?? '';
      expect(nodo.getAttribute('data-origen')).toBe('corpus');
      expect(origen.camposCopiadosDelCorpus).toContain(campo);
      expect(nodo.children.length).toBe(0);
      expect(nodo.textContent).toBe(cita[campo as keyof typeof cita]);
    }
    expect(screen.getByText(opcion.rationale).closest('[data-origen]')).toBeNull();
    expect(screen.getByText(opcion.option).closest('[data-origen]')).toBeNull();
    const ausentes = screen.getAllByText(evidence.cita.noDisponible);
    expect(ausentes.length).toBeGreaterThan(0);
    for (const ausente of ausentes) expect(ausente.closest('[data-origen]')).toBeNull();
  });

  it('muestra el rótulo exacto Relevancia de recuperación de evidencia con 0,87 después de las citas, con la presentación del orden por la cita más relevante, la nota y la ayuda negadas, en estilo secundario [US-061 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    await analizar();

    const etiqueta = await screen.findByTestId('relevance-label');
    const valor = screen.getByTestId('relevance-value');
    const ayuda = screen.getByTestId('relevance-help');
    expect(etiqueta.textContent).toBe('Relevancia de recuperación de evidencia');
    expect(valor.textContent).toBe('0,87');
    expect(screen.getByTestId('relevance-basis').textContent).toBe(
      'Orden basado en la cita recuperada más relevante asociada a cada opción',
    );
    expect(ayuda.textContent).toBe(
      'No resume la aplicabilidad, la eficacia ni la calidad global de la opción.',
    );
    expect(valor.getAttribute('aria-describedby')).toBe(ayuda.id);
    expect(
      screen.getByText('Metadato secundario: no mide eficacia ni solidez clínica'),
    ).toBeTruthy();
    const citas = screen.getByRole('list', { name: /citas/i });
    expect(citas.compareDocumentPosition(etiqueta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(etiqueta.closest('[data-estilo="secundario"]')).not.toBeNull();
    expect(screen.queryByText('Relevancia de la evidencia')).toBeNull();
    expect(screen.queryByText('Evidencia')).toBeNull();
  });

  it('muestra el criterio Ordenado por relevancia de recuperación de la búsqueda y no el de aplicabilidad cuando applicability está vacío [US-061 AC-3]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    await analizar();

    const criterio = await screen.findByText(
      'Ordenado por relevancia de recuperación de la búsqueda; no representa prioridad ni aplicabilidad clínica.',
    );
    const tarjeta = screen.getByRole('heading', { level: 3, name: opcion.option });
    expect(
      criterio.compareDocumentPosition(tarjeta) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText(/Ordenadas por coincidencia con la población estudiada/)).toBeNull();
    expect(screen.queryByText(/Seleccionada por relevancia de la búsqueda/)).toBeNull();
  });

  it('no muestra tarjeta y pliega las descartadas con la afirmación Sin soporte, el motivo con lenguaje no permitido y sin controles cuando solo hay descartadas [US-061 AC-4]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaSoloDescartadas });
    const usuario = await analizar();

    const titulo = await screen.findByRole('button', { name: evidence.discarded.titulo });
    expect(titulo.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('heading', { level: 3, name: SIN_BASE })).toBeNull();
    expect(screen.queryByText(descartada.unsupportedClaims[0]!)).toBeNull();

    await usuario.click(titulo);
    const seccion = within(document.getElementById(titulo.getAttribute('aria-controls')!)!);
    expect(seccion.getByText(descartada.option)).toBeTruthy();
    expect(seccion.getByText(evidence.discardReason.afirmacion_sin_soporte)).toBeTruthy();
    const afirmacion = seccion.getByText(descartada.unsupportedClaims[0]!);
    expect(afirmacion.parentElement?.textContent).toContain(evidence.discarded.sinSoporte);
    expect(seccion.queryAllByRole('button')).toEqual([]);
    expect(seccion.queryAllByRole('link')).toEqual([]);
  });

  it('muestra el número de orden, el id del análisis y el createdAt de cada descartada con Registro solo para auditoría y sin la traza completa [US-061 AC-4]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaSoloDescartadas });
    const usuario = await analizar();
    await usuario.click(await screen.findByRole('button', { name: evidence.discarded.titulo }));

    const auditoria = screen.getByTestId('discarded-audit-meta');
    expect(auditoria.textContent).toContain('N.º 1');
    expect(auditoria.textContent).toContain(conEvidenciaSoloDescartadas.id);
    expect(auditoria.textContent).toContain(conEvidenciaSoloDescartadas.createdAt);
    expect(
      screen.getByText('Registro solo para auditoría: no es contenido clínico utilizable.'),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/ruleId|chunkIds|policyVersion/);
  });

  it('no muestra encabezado de opciones ni descartadas cuando la pregunta no es terapéutica [US-061 AC-5]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaSinOpciones });
    await analizar('Q-TOX');

    expect(await screen.findByText(evidence.resultado.sinOpciones)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: evidence.resultado.encabezado })).toBeNull();
    expect(screen.queryByText(evidence.discarded.titulo)).toBeNull();
  });

  it('el textarea tiene label, el botón se activa con Enter y el resultado se anuncia en role=status sin mover el foco [US-061 AC-6]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    const usuario = userEvent.setup();
    montarPanel();

    await usuario.tab();
    const campo = screen.getByLabelText('Pregunta clínica');
    expect(document.activeElement).toBe(campo);
    await usuario.keyboard(peticion.query);
    await usuario.tab();
    const boton = screen.getByRole('button', { name: 'Analizar evidencia' });
    expect(document.activeElement).toBe(boton);
    await usuario.keyboard('{Enter}');

    const estado = await screen.findByRole('status');
    await waitFor(() => expect(estado.textContent).toBe(evidence.estado.listoUna));
    expect(estado.getAttribute('aria-live')).toBe('polite');
    expect(document.activeElement).toBe(boton);
    expect(estado.closest('[data-testid="analysis-result"]')).toBeNull();
  });
});
