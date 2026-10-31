// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { crearBffAnalisisSimulado } from '../support/msw/evidence-analyses';
import { abrirTabla, fx08ba, fx08bbDosFuentes } from '../support/aplicabilidad-ui';
import { analizar, evidence } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();

describe('Tabla de aplicabilidad · fuentes, sin puntaje y criterio de orden', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('trae el resumen de la fuente más aplicable en la tarjeta y el de cada fuente al expandir cuando la opción tiene varias fuentes [US-126 AC-5]', async () => {
    bff.responder({ status: 200, cuerpo: fx08bbDosFuentes() });
    const usuario = await analizar();
    const tarjeta = await screen.findByRole('article');

    expect(
      within(tarjeta).getAllByRole('group', {
        name: 'Coincide 2, Parcial 0, No coincide 0, Desconocido 3',
      }),
    ).toHaveLength(1);
    expect(within(tarjeta).queryAllByRole('region')).toHaveLength(0);

    const tabla = await abrirTabla(usuario);

    const fuentes = within(tabla).getAllByRole('region');
    expect(fuentes).toHaveLength(2);
    expect(
      within(fuentes[0]!).getByRole('group', {
        name: 'Coincide 2, Parcial 0, No coincide 0, Desconocido 3',
      }).textContent,
    ).toBe('✓ Coincide 2 · ◐ Parcial 0 · ✕ No coincide 0 · ? Desconocido 3');
    expect(
      within(fuentes[1]!).getByRole('heading', { name: 'Segunda fuente sintética' }),
    ).toBeTruthy();
    expect(
      within(fuentes[1]!).getByRole('group', {
        name: 'Coincide 1, Parcial 0, No coincide 0, Desconocido 1',
      }).textContent,
    ).toBe('✓ Coincide 1 · ◐ Parcial 0 · ✕ No coincide 0 · ? Desconocido 1');
  });

  it('no muestra puntaje, porcentaje, barra ni número de aplicabilidad distinto de los conteos cuando la tabla está desplegada [US-126 AC-6]', async () => {
    bff.responder({ status: 200, cuerpo: fx08ba() });
    const usuario = await analizar();

    const tabla = await abrirTabla(usuario);

    expect(tabla.textContent).not.toMatch(/%|puntaje|puntuación|probabilidad|score/i);
    expect(tabla.querySelector('[role="progressbar"], [role="meter"], progress, meter')).toBeNull();
    const copia = tabla.cloneNode(true) as HTMLElement;
    copia.querySelectorAll('[role="group"]').forEach((conteos) => conteos.remove());
    const origen = 'según NCI PDQ · CDR0000062787';
    copia
      .querySelectorAll('li')
      .forEach((li) => (li.textContent = li.textContent!.replaceAll(origen, '')));
    const numeros = (copia.textContent ?? '').match(/\d+(?:[.,]\d+)?/g) ?? [];
    // Solo quedan los valores de los datos (3+, 0-1…) y los «Fragmento [n]», nunca un número de aplicabilidad.
    expect(copia.textContent).not.toMatch(/aplicabilidad:?\s*\d|coincidencia:?\s*\d/i);
    expect(numeros.every((n) => /^[0-3]$/.test(n))).toBe(true);
  });

  it('muestra el criterio de orden por aplicabilidad con el literal existente y no el texto antiguo cuando la tabla está desplegada [US-126 AC-7]', async () => {
    bff.responder({ status: 200, cuerpo: fx08ba() });
    const usuario = await analizar();

    await abrirTabla(usuario);

    expect(await screen.findByText(evidence.orderCriterion.applicability)).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Ver aplicabilidad por criterio' })
        .getAttribute('aria-expanded'),
    ).toBe('true');
    expect(document.body.textContent).not.toContain(
      'Ordenadas por coincidencia con la población estudiada, no por eficacia',
    );
  });
});
