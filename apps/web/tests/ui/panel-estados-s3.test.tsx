// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidencia,
  conEvidenciaAplicabilidad,
  conEvidenciaPoblacionNoComparable,
  crearBffAnalisisSimulado,
  errorColaLlena,
  errorDeadline,
  errorLlmNoDisponible,
  errorServicioIa,
  sinEvidencia,
  tipoNoHabilitado,
} from '../support/msw/evidence-analyses';
import { analizar, evidence, montarPanel, PREGUNTA_DE_PRUEBA } from '../support/panel-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearBffAnalisisSimulado();

const LIMITE = 'Se alcanzó el límite de análisis. Puedes reintentar en 30 segundos.';
const SIN_CONEXION = 'No hay conexión con el servidor. No se muestra ningún resultado parcial.';
const CRITERIO_APLICABILIDAD =
  'Orden por aplicabilidad: primero la opción con menos criterios excluyentes en No coincide; luego, la que coincide en más criterios con los datos registrados; la relevancia de recuperación solo desempata. Es un criterio de orden, no una valoración clínica.';
const CRITERIO_NEUTRO =
  'Ordenado por relevancia de recuperación de la búsqueda; no representa prioridad ni aplicabilidad clínica.';
const AVISO_POBLACION =
  'Según los datos registrados, al menos un criterio excluyente del estudio no coincide con este paciente. La opción se muestra igualmente.';
const PREFIJO_CONTEOS = 'Criterios del estudio frente a datos registrados:';
const NO_EVALUADA = 'Aplicabilidad no evaluada: sin datos de población en las fuentes citadas';

function textoSinSimbolos(nodo: HTMLElement): string {
  const copia = nodo.cloneNode(true) as HTMLElement;
  copia.querySelectorAll('[aria-hidden="true"]').forEach((simbolo) => simbolo.remove());
  return copia.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

async function escribirYEnviar(pregunta: string, pegar = false) {
  const usuario = userEvent.setup();
  montarPanel();
  const campo = screen.getByLabelText(evidence.formulario.pregunta);
  await usuario.click(campo);
  if (pegar) await usuario.paste(pregunta);
  else await usuario.type(campo, pregunta);
  await usuario.click(screen.getByRole('button', { name: evidence.formulario.analizar }));
  return usuario;
}

describe('EvidencePanel · estados del S3', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    bff.reiniciar();
    replace.mockReset();
  });

  it('muestra el skeleton, deshabilita el botón y envía una sola petición cuando el doctor hace doble clic en Analizar evidencia [US-062 AC-1]', async () => {
    let liberar!: () => void;
    const compuerta = new Promise<void>((resolver) => (liberar = resolver));
    bff.responder({ status: 200, cuerpo: conEvidencia, compuerta });
    const usuario = userEvent.setup();
    montarPanel();
    await usuario.type(screen.getByLabelText(evidence.formulario.pregunta), PREGUNTA_DE_PRUEBA);

    await usuario.dblClick(screen.getByRole('button', { name: evidence.formulario.analizar }));

    expect(screen.getByTestId('option-skeleton')).toBeTruthy();
    const boton = screen.getByRole('button', { name: 'Analizando…' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(screen.getByText('El contenido aparece completo cuando está validado.')).toBeTruthy();
    liberar();
    expect(
      await screen.findByRole('heading', { name: evidence.resultado.encabezado }),
    ).toBeTruthy();
    expect(bff.cuerpos).toHaveLength(1);
    expect(screen.queryByTestId('option-skeleton')).toBeNull();
    expect(screen.getByRole('button', { name: evidence.formulario.analizar })).toBeTruthy();
  });

  it('muestra el alcance, Relevancia máxima: no aplica, Qué se buscó y la Base sin nada con forma de opción cuando el análisis es sin_evidencia [US-062 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: sinEvidencia });
    await analizar();

    expect(
      await screen.findByText(
        'Ningún fragmento del corpus superó el umbral de relevancia. No se generaron opciones.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'La búsqueda se limita a las fuentes consultadas; no implica que no exista evidencia.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Relevancia máxima: no aplica')).toBeTruthy();
    const busqueda = screen.getByRole('region', { name: 'Qué se buscó' });
    expect(within(busqueda).getByText(sinEvidencia.queryText)).toBeTruthy();
    expect(within(busqueda).getByText(/Idioma.*es/)).toBeTruthy();
    expect(within(busqueda).getByText(/Guías, Publicaciones/)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Base del análisis' })).toBeTruthy();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('heading', { name: evidence.resultado.encabezado })).toBeNull();
    expect(screen.queryByText(/No se encontró evidencia suficiente/)).toBeNull();
    expect(screen.queryByText(/\b0,00\b|Relevancia máxima: 0/)).toBeNull();
  });

  it('muestra el error junto al campo, el contador 2001 / 2000 y no envía cuando la pregunta tiene 2001 caracteres [US-062 AC-4]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    await escribirYEnviar('a'.repeat(2001), true);

    const campo = screen.getByLabelText(evidence.formulario.pregunta) as HTMLTextAreaElement;
    const error = await screen.findByText('La pregunta admite como máximo 2000 caracteres.');
    expect(campo.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.value).toHaveLength(2001);
    const contador = screen.getByText('2001 / 2000');
    expect(contador.getAttribute('aria-live')).toBe('polite');
    expect(bff.cuerpos).toHaveLength(0);
    expect(screen.queryByTestId('analysis-result')).toBeNull();
  });

  it('indica reintentar en 30 segundos y habilita Reintentar al vencer el plazo cuando la respuesta es 429 con Retry-After 30 [US-062 AC-5]', async () => {
    // Solo el plazo del aviso es simulado: sin reloj real mezclado, el vencimiento ocurre solo al avanzarlo aquí.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Testing Library solo avanza el reloj simulado en sus esperas si detecta `jest`; sin esto se cuelga.
    vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
    bff.responder({ status: 429, cuerpo: errorColaLlena, cabeceras: { 'Retry-After': '30' } });
    const usuario = userEvent.setup({ delay: null });
    montarPanel();
    await usuario.type(screen.getByLabelText(evidence.formulario.pregunta), PREGUNTA_DE_PRUEBA);
    await usuario.click(screen.getByRole('button', { name: evidence.formulario.analizar }));

    const aviso = await screen.findByText(LIMITE);
    expect(aviso.closest('[role="status"]')).toBeTruthy();
    const reintentar = screen.getByRole('button', { name: 'Reintentar' }) as HTMLButtonElement;
    expect(reintentar.disabled).toBe(true);
    expect(document.body.textContent).not.toContain(errorColaLlena.message);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    await act(async () => {}); // el efecto que arma el plazo ya corrió antes de avanzar el reloj
    await act(async () => vi.advanceTimersByTime(30_000));
    const reintentarVencido = await screen.findByRole('button', { name: 'Reintentar' });
    await waitFor(() => expect((reintentarVencido as HTMLButtonElement).disabled).toBe(false));
  });

  it('muestra el mensaje genérico y Reintentar habilitado cuando el 429 no trae un Retry-After válido', async () => {
    bff.responder({ status: 429, cuerpo: errorColaLlena, cabeceras: { 'Retry-After': 'pronto' } });
    await analizar();

    expect(await screen.findByText(evidence.error.generico)).toBeTruthy();
    expect(screen.queryByText(/Puedes reintentar en/)).toBeNull();
    const reintentar = screen.getByRole('button', { name: 'Reintentar' }) as HTMLButtonElement;
    expect(reintentar.disabled).toBe(false);
  });

  it.each([
    [502, errorServicioIa, evidence.error.generico],
    [503, errorLlmNoDisponible, evidence.error.modeloNoDisponible],
    [504, errorDeadline, evidence.error.tiempoAgotado],
  ])(
    'muestra mensaje genérico, código de traza y Reintentar con foco, sin nombres de servicios ni trazas, cuando la respuesta es %i [US-062 AC-5]',
    async (status, cuerpo, mensaje) => {
      bff.responder({ status, cuerpo });
      await analizar();

      expect(await screen.findByText(mensaje)).toBeTruthy();
      expect(screen.getByText(`Código de traza: ${cuerpo.traceId}`)).toBeTruthy();
      const reintentar = screen.getByRole('button', { name: 'Reintentar' });
      await waitFor(() => expect(document.activeElement).toBe(reintentar));
      const visible = document.body.textContent ?? '';
      expect(visible).not.toMatch(
        /rag-orchestrator|clinical-api|Ollama|http:\/\/|Error:|\bat \S+\(/,
      );
      expect(visible).not.toContain(cuerpo.error);
      // El mensaje del S1 puede coincidir con el `message` (503); se quita solo ese fragmento legítimo.
      expect(visible.replace(mensaje, '')).not.toContain(cuerpo.message);
    },
  );

  it('muestra No hay conexión con el servidor y Reintentar cuando falla la red [US-062 AC-5]', async () => {
    bff.responder({ status: 0, cuerpo: {}, red: true });
    await analizar();

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain(SIN_CONEXION);
    const reintentar = screen.getByRole('button', { name: 'Reintentar' });
    await waitFor(() => expect(document.activeElement).toBe(reintentar));
    expect(screen.queryByText(/Código de traza/)).toBeNull();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('muestra Tipo de cáncer fuera del alcance del piloto, el aviso de IA y ninguna tarjeta cuando el status es tipo_no_habilitado [US-062 AC-6]', async () => {
    bff.responder({ status: 200, cuerpo: tipoNoHabilitado });
    await analizar();

    expect(await screen.findByText(/Tipo de cáncer fuera del alcance del piloto/)).toBeTruthy();
    for (const aviso of screen.getAllByRole('note')) {
      expect(aviso.textContent).toBe(tipoNoHabilitado.disclaimer);
    }
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('heading', { name: evidence.resultado.encabezado })).toBeNull();
    expect(screen.queryByTestId('relevance-label')).toBeNull();
    expect(screen.queryByText(CRITERIO_NEUTRO)).toBeNull();
    expect(screen.queryByText(evidence.discarded.titulo)).toBeNull();
  });

  it('redirige a /login?motivo=expirada sin mostrar datos cuando la respuesta es 401 [US-062 AC-3]', async () => {
    bff.responder({ status: 401, cuerpo: { error: 'NO_AUTENTICADO' } });
    await analizar();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?motivo=expirada'));
    expect(screen.queryByTestId('analysis-result')).toBeNull();
  });

  it('muestra el criterio de orden por aplicabilidad, la línea de conteos con prefijo sin puntaje ni porcentaje y la relevancia que solo desempata cuando la opción trae aplicabilidad calculada [US-062 AC-7]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaAplicabilidad });
    await analizar();

    expect(await screen.findByText(CRITERIO_APLICABILIDAD)).toBeTruthy();
    expect(screen.queryByText(CRITERIO_NEUTRO)).toBeNull();
    const tarjeta = screen.getByRole('article');
    expect(within(tarjeta).getByText(PREFIJO_CONTEOS)).toBeTruthy();
    const conteos = within(tarjeta).getByRole('group', {
      name: 'Coincide 2, Parcial 0, No coincide 0, Desconocido 4',
    });
    expect(textoSinSimbolos(conteos)).toBe(
      'Coincide 2 · Parcial 0 · No coincide 0 · Desconocido 4',
    );
    expect(within(tarjeta).getByTestId('relevance-basis').textContent).toBe(
      'Metadato de recuperación; no mide solidez clínica ni probabilidad, y solo desempata el orden por aplicabilidad.',
    );
    expect(tarjeta.textContent).not.toMatch(/%|Orden basado en la cita/);
    expect(within(tarjeta).queryByRole('progressbar')).toBeNull();
    expect(within(tarjeta).queryByText(AVISO_POBLACION)).toBeNull();
    expect(within(tarjeta).queryByText(NO_EVALUADA)).toBeNull();
  });

  it('muestra el aviso de población no comparable sin ocultar la opción ni bloquear controles cuando populationNotComparable es true [US-062 AC-7]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaPoblacionNoComparable });
    await analizar();

    const aviso = await screen.findByText(AVISO_POBLACION);
    expect(aviso.closest('[role="status"]')).toBeTruthy();
    const tarjeta = screen.getByRole('article');
    expect(within(tarjeta).getByRole('heading', { name: /Quimioterapia/ })).toBeTruthy();
    expect(
      within(tarjeta).getByRole('group', {
        name: 'Coincide 1, Parcial 0, No coincide 1, Desconocido 4',
      }),
    ).toBeTruthy();
    expect(within(tarjeta).getByTestId('relevance-value')).toBeTruthy();
    const analizarDeNuevo = screen.getByRole('button', { name: evidence.formulario.analizar });
    expect((analizarDeNuevo as HTMLButtonElement).disabled).toBe(false);
  });

  it('dice Aplicabilidad no evaluada y no muestra ceros cuando la opción trae perSource vacío [US-062 AC-7]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    await analizar();

    const tarjeta = await screen.findByRole('article');
    expect(within(tarjeta).getByText(NO_EVALUADA)).toBeTruthy();
    expect(within(tarjeta).queryByText(PREFIJO_CONTEOS)).toBeNull();
    expect(tarjeta.textContent).not.toContain('Desconocido 0');
  });

  it('conserva el criterio neutro y la base del S1 cuando la opción no trae aplicabilidad calculada [US-061 AC-3]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidencia });
    await analizar();

    expect(await screen.findByText(CRITERIO_NEUTRO)).toBeTruthy();
    expect(screen.queryByText(CRITERIO_APLICABILIDAD)).toBeNull();
    expect(screen.getByTestId('relevance-basis').textContent).toBe(
      'Metadato de recuperación; no mide solidez clínica ni probabilidad.',
    );
  });
});
