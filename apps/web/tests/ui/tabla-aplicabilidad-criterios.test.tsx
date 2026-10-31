// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidenciaPoblacionA_M2,
  conEvidenciaPoblacionA_M2B,
  conEvidenciaPoblacionNoComparable,
  crearBffAnalisisSimulado,
} from '../support/msw/evidence-analyses';
import {
  a_m2bConCriterio,
  abrirTabla,
  filaDe,
  fx08ba,
  textoSinSimbolos,
} from '../support/aplicabilidad-ui';
import { analizar, ID_PACIENTE } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();
const RESUMEN_DOC_A1 = '✓ Coincide 2 · ◐ Parcial 0 · ✕ No coincide 0 · ? Desconocido 3';

function celdas(fila: HTMLElement) {
  return within(fila)
    .getAllByRole('cell')
    .map((celda) => textoSinSimbolos(celda));
}

describe('Tabla de aplicabilidad · criterios y causas', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('muestra criterio, valor del paciente, del estudio y estado en texto, y el resumen con símbolos aria-hidden cuando se abre doc-a1 [US-126 AC-1]', async () => {
    bff.responder({ status: 200, cuerpo: fx08ba() });
    const usuario = await analizar();

    const tabla = await abrirTabla(usuario);

    const boton = screen.getByRole('button', { name: 'Ver aplicabilidad por criterio' });
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(
      within(tabla)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual([
      'Criterio',
      'Paciente',
      'Estudio (valores extraídos de la fuente por IA y verificados contra el fragmento)',
      'Estado',
    ]);
    expect(within(tabla).getAllByRole('row')).toHaveLength(1 + 5);
    expect(celdas(filaDe(tabla, /Estado HER2/))).toEqual([
      '3+ (IHQ)',
      'positivo · Fragmento [1] · según NCI PDQ · CDR0000062787',
      'Coincide',
    ]);
    expect(celdas(filaDe(tabla, /ECOG/))[2]).toBe('Coincide');
    const resumen = within(tabla).getByRole('group', {
      name: 'Coincide 2, Parcial 0, No coincide 0, Desconocido 3',
    });
    expect(resumen.textContent).toBe(RESUMEN_DOC_A1);
    expect(resumen.querySelectorAll('[aria-hidden="true"]')).toHaveLength(4);
    expect(tabla.textContent).not.toMatch(/2 coinciden|3 desconocidos/);
  });

  it('lee falta en los datos registrados con enlace a la ficha, no reportado por la fuente y respaldo fallido sin insinuar coincidencia cuando el criterio está en Desconocido [US-126 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: fx08ba() });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario);

    const menopausia = filaDe(tabla, /Estado menopáusico/);
    expect(
      within(menopausia).getByText('Desconocido · falta en los datos registrados'),
    ).toBeTruthy();
    const enlace = within(menopausia).getByRole('link', {
      name: 'Registrar Estado menopáusico en la ficha',
    });
    expect(enlace.getAttribute('href')).toBe(`/pacientes/${ID_PACIENTE}`);
    const her2 = filaDe(tabla, /Receptores hormonales/);
    expect(
      within(her2)
        .getByRole('link', { name: 'Registrar Receptores hormonales en la ficha' })
        .getAttribute('href'),
    ).toBe(`/pacientes/${ID_PACIENTE}#biomarcadores`);
    expect(
      within(filaDe(tabla, /Línea de tratamiento/)).getByText(
        'Desconocido · la fuente no reporta este dato',
      ),
    ).toBeTruthy();
    expect(within(tabla).queryAllByRole('link')).toHaveLength(2);
  });

  it('lee que no se pudo determinar el valor y que no indica coincidencia cuando el criterio tiene respaldo_fallido [US-126 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaPoblacionA_M2 });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario, 0);

    const ecog = filaDe(tabla, /ECOG/);
    expect(
      within(ecog).getByText(
        'Desconocido · no se pudo determinar el valor del estudio; no indica que el criterio coincida ni que no coincida',
      ),
    ).toBeTruthy();
    expect(textoSinSimbolos(ecog)).not.toMatch(/Coincide(?! ni)/);
  });

  it('lee que el catálogo no define cómo comparar el criterio y ninguna fila en Desconocido queda sin causa cuando unknownReason es sin_regla_de_comparacion [US-126 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaPoblacionA_M2B });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario, 2);

    expect(
      within(filaDe(tabla, /Terapia previa/)).getByText(
        'Desconocido · el catálogo no define cómo comparar este criterio',
      ),
    ).toBeTruthy();
    for (const fila of within(tabla).getAllByRole('row').slice(1)) {
      if (/Desconocido/.test(textoSinSimbolos(fila))) {
        expect(textoSinSimbolos(fila)).toMatch(/Desconocido · \S/);
      }
    }
  });

  it('lee causa no registrada en este análisis y ninguna otra causa cuando un análisis histórico trae unknownReason null [US-126 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaPoblacionNoComparable });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario);

    const estadio = filaDe(tabla, /Estadio/);
    expect(
      within(estadio).getByText('Desconocido · causa no registrada en este análisis'),
    ).toBeTruthy();
    expect(textoSinSimbolos(estadio)).not.toMatch(/falta en|no reporta|catálogo|respaldo/);
  });

  it('muestra los valores del estudio con su fragmento y no un mensaje de fallo cuando unknownReason es varios_valores_en_la_fuente [US-126 AC-2]', async () => {
    const cuerpo = a_m2bConCriterio(1, {
      status: 'desconocido',
      unknownReason: 'varios_valores_en_la_fuente',
      partialReason: null,
    });
    bff.responder({ status: 200, cuerpo });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario, 1);

    const fila = filaDe(tabla, /Estado menopáusico/);
    const [, estudio, estado] = celdas(fila);
    expect(estudio).toContain('premenopausal women · Fragmento [1] · según NCI PDQ · doc-b10');
    expect(estudio).toContain('postmenopausal women · Fragmento [2] · según NCI PDQ · doc-b10');
    expect(estado).toBe(
      'Desconocido · la fuente reporta varios valores; se muestran junto a su fragmento, sin determinar cuál corresponde al paciente',
    );
    expect(estado).not.toMatch(/no se pudo|error|fall/i);
  });

  it('lleva la etiqueta Población no comparable en la fuente sin ocultar su tabla cuando la fuente tiene población no comparable [US-126 AC-3]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaPoblacionNoComparable });
    const usuario = await analizar();

    const tabla = await abrirTabla(usuario);

    const fuente = within(tabla).getByRole('region');
    expect(within(fuente).getByText('Población no comparable')).toBeTruthy();
    expect(within(fuente).getAllByRole('row').length).toBeGreaterThan(1);
  });

  it('no muestra la etiqueta Población no comparable cuando la fuente es comparable [US-126 AC-3]', async () => {
    bff.responder({ status: 200, cuerpo: fx08ba() });
    const usuario = await analizar();

    const tabla = await abrirTabla(usuario);

    expect(within(tabla).queryByText('Población no comparable')).toBeNull();
  });

  it('lleva Dato del paciente sin verificar junto al valor sin ocultar ni bloquear la fila cuando ecog no está verificado [US-126 AC-4]', async () => {
    bff.responder({ status: 200, cuerpo: fx08ba() });
    const usuario = await analizar();

    const tabla = await abrirTabla(usuario);

    const ecog = filaDe(tabla, /ECOG/);
    const [paciente, estudio] = celdas(ecog);
    expect(paciente).toBe('1 Dato del paciente sin verificar');
    expect(estudio).toBe('0-1 · Fragmento [1] · según NCI PDQ · CDR0000062787');
    expect(within(tabla).getAllByText('Dato del paciente sin verificar')).toHaveLength(1);
    expect(
      (screen.getByRole('button', { name: 'Analizar evidencia' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
