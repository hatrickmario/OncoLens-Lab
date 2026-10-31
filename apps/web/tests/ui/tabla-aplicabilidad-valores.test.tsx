// @vitest-environment jsdom
import { cleanup, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  conEvidenciaPoblacionA_M2,
  conEvidenciaPoblacionA_M2B,
  conEvidenciaAplicabilidad,
  crearBffAnalisisSimulado,
} from '../support/msw/evidence-analyses';
import { abrirTabla, filaDe, textoSinSimbolos } from '../support/aplicabilidad-ui';
import { analizar } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();
const CONFLICTO =
  'Desconocido · los fragmentos citados muestran valores distintos; se muestran ambos; requieren contraste con la fuente y con la validación clínica/patológica';

const estudioDe = (fila: HTMLElement) => textoSinSimbolos(within(fila).getAllByRole('cell')[1]!);
const estadoDe = (fila: HTMLElement) => textoSinSimbolos(within(fila).getAllByRole('cell')[2]!);

describe('Tabla de aplicabilidad · valores del estudio', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    bff.reiniciar();
  });

  it('muestra 3 valores con su fragmento, ver más con el cuarto, foco en él y cero peticiones cuando la opción O-P10 trae 4 valores [US-126 AC-8]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaPoblacionA_M2B });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario, 1);
    const fila = filaDe(tabla, /Estado menopáusico/);

    expect(
      within(fila)
        .getAllByRole('listitem')
        .map((v) => textoSinSimbolos(v)),
    ).toEqual([
      'premenopausal women · Fragmento [1] · según NCI PDQ · doc-b10',
      'perimenopausal women · Fragmento [1] · según NCI PDQ · doc-b10',
      'postmenopausal women · Fragmento [2] · según NCI PDQ · doc-b10',
    ]);
    const ver = within(fila).getByRole('button', { name: '+ 1 valor más ▸ ver más' });
    expect(ver.getAttribute('aria-expanded')).toBe('false');
    const peticiones = bff.cuerpos.length;
    const red = vi.spyOn(globalThis, 'fetch');

    await usuario.click(ver);

    const valores = within(fila).getAllByRole('listitem');
    expect(valores).toHaveLength(4);
    expect(textoSinSimbolos(valores[3]!)).toBe(
      'women aged 60 or older · Fragmento [2] · según NCI PDQ · doc-b10',
    );
    expect(document.activeElement).toBe(valores[3]);
    const menos = within(fila).getByRole('button', { name: 'ver menos' });
    expect(menos.getAttribute('aria-expanded')).toBe('true');
    expect(bff.cuerpos).toHaveLength(peticiones);
    expect(red).not.toHaveBeenCalled();

    await usuario.click(menos);

    expect(within(fila).getAllByRole('listitem')).toHaveLength(3);
  });

  it('lee el valor único sin error y sin ver más cuando el análisis solo trae studyPopulationValue [US-126 AC-8]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaAplicabilidad });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario);

    const fila = filaDe(tabla, /Estado HER2/);
    expect(estudioDe(fila)).toBe('positivo · Fragmento [1] · según NCI PDQ · CDR0000062787');
    expect(within(fila).queryByRole('button')).toBeNull();
  });

  it('muestra ambos valores con sus fragmentos, la fecha de publicación y ninguno marcado como correcto cuando estado_her2 está en conflicto [US-126 AC-9]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaPoblacionA_M2B });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario, 0);

    const fila = filaDe(tabla, /Estado HER2/);
    expect(estadoDe(fila)).toBe(CONFLICTO);
    const valores = within(fila).getAllByRole('listitem');
    expect(valores.map((v) => textoSinSimbolos(v))).toEqual([
      'HER2-positive (IHC 3+) · Fragmento [1] · según NCI PDQ · doc-b4 · Publicado: 15/03/2024 · Tamaño de muestra del estudio: No disponible',
      'HER2-negative (IHC 2+, ISH not amplified) · Fragmento [2] · según NCI PDQ · doc-b4 · Publicado: 15/03/2024 · Tamaño de muestra del estudio: No disponible',
    ]);
    expect(fila.textContent).not.toMatch(/correcto|preferid|recomend/i);
    expect(fila.querySelector('[aria-current], [data-seleccionado]')).toBeNull();
  });

  it('muestra el tamaño de muestra solo junto al valor cuyo fragmento lo trae cuando uno de los fragmentos en conflicto lo registra [US-126 AC-9]', async () => {
    const cuerpo = structuredClone(conEvidenciaPoblacionA_M2B) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    cuerpo.evidenceOptions[0].citedSources[1].sampleSize = 120;
    bff.responder({ status: 200, cuerpo });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario, 0);

    const valores = within(filaDe(tabla, /Estado HER2/)).getAllByRole('listitem');
    expect(textoSinSimbolos(valores[0]!)).toContain('Tamaño de muestra del estudio: No disponible');
    expect(textoSinSimbolos(valores[1]!)).toContain('Tamaño de muestra del estudio: 120');
  });

  it('muestra Publicado: No disponible cuando el fragmento en conflicto no trae publishedAt [US-126 AC-9]', async () => {
    const cuerpo = structuredClone(conEvidenciaPoblacionA_M2B) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    cuerpo.evidenceOptions[0].citedSources[0].publishedAt = null;
    bff.responder({ status: 200, cuerpo });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario, 0);

    const valores = within(filaDe(tabla, /Estado HER2/)).getAllByRole('listitem');
    expect(textoSinSimbolos(valores[0]!)).toContain('Publicado: No disponible');
    expect(textoSinSimbolos(valores[1]!)).toContain('Publicado: 15/03/2024');
  });

  it('rotula el valor como extraído por IA con fragmento no disponible cuando la forma antigua no trae citedSources [US-126 AC-8]', async () => {
    const cuerpo = structuredClone(conEvidenciaAplicabilidad) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    cuerpo.applicability[0].criteria[0].citedSources = [];
    bff.responder({ status: 200, cuerpo });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario);

    expect(estudioDe(filaDe(tabla, /Estado HER2/))).toBe(
      'positivo · valor extraído por IA; fragmento no disponible',
    );
  });

  it('lee Parcial inclusivo, Parcial mezclado y el subgrupo como contexto sin contarlo cuando la opción es O-P1, O-P5 y O-P6 [US-126 AC-10]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaPoblacionA_M2 });
    const usuario = await analizar();

    const inclusiva = await abrirTabla(usuario, 0);
    expect(
      within(filaDe(inclusiva, /Estado menopáusico/)).getByText(
        'Parcial · el estudio incluyó varios grupos, entre ellos el del paciente',
      ),
    ).toBeTruthy();
    const mezclada = await abrirTabla(usuario, 1);
    expect(
      within(filaDe(mezclada, /Estado menopáusico/)).getByText(
        'Parcial · el fragmento mezcla poblaciones sin desagregarlas',
      ),
    ).toBeTruthy();
    const subgrupo = await abrirTabla(usuario, 2);
    const fila = filaDe(subgrupo, /Receptores hormonales/);
    expect(estadoDe(fila)).toBe(
      'Desconocido · la fuente no reporta este dato para la población elegible (solo para un subgrupo)',
    );
    expect(within(fila).getByText('Contexto (no cuenta para el estado)')).toBeTruthy();
    expect(estudioDe(fila)).toContain(
      'subgrupo «triple-negative (TNBC)» · Fragmento [1] · según NCI PDQ · doc-b6',
    );
    expect(
      within(subgrupo).getByRole('group', {
        name: 'Coincide 0, Parcial 0, No coincide 0, Desconocido 1',
      }),
    ).toBeTruthy();
  });

  it('lee solo un subgrupo cuando un análisis antiguo trae partialReason solo_subgrupo sin lista [US-126 AC-10]', async () => {
    const cuerpo = structuredClone(conEvidenciaPoblacionA_M2) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const criterio = cuerpo.applicability[0].criteria[1];
    delete criterio.studyPopulationValues;
    criterio.partialReason = 'solo_subgrupo';
    bff.responder({ status: 200, cuerpo });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario, 0);

    expect(
      within(filaDe(tabla, /Estado menopáusico/)).getByText('Parcial · solo un subgrupo'),
    ).toBeTruthy();
  });
});
