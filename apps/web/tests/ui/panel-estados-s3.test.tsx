// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidencia,
  conEvidenciaAplicabilidad,
  conEvidenciaPoblacionNoComparable,
  crearBffAnalisisSimulado,
  sinEvidencia,
  tipoNoHabilitado,
} from '../support/msw/evidence-analyses';
import { analizar, esperarComposerOperable, evidence } from '../support/panel-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearBffAnalisisSimulado();

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
    const usuario = await analizar();

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
    await esperarComposerOperable(usuario);
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
