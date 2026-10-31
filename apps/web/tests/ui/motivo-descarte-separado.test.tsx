// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { aplanarMensajes } from '../../../../packages/clinical-language/src/aplanar-mensajes';
import { checkProhibitedTerms } from '../../../../packages/clinical-language/src/check-prohibited-terms';
import { loadProhibitedTerms } from '../../../../packages/clinical-language/src/load-prohibited-terms';
import { mensajes } from '../../lib/mensajes';
import {
  conEvidenciaSoloDescartadas,
  crearBffAnalisisSimulado,
  soloDescartadasLenguaje,
  soloDescartadasSinSoporteYLenguaje,
} from '../support/msw/evidence-analyses';
import { analizar, evidence } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();

// Literales de US-246 / docs/ux/S4/pantallas-s4.md S4-02 (la fuente de verdad del texto es la historia).
const ETIQUETA_SIN_SOPORTE = 'Una afirmación no tiene soporte en la fuente citada';
const ETIQUETA_LENGUAJE = 'Contenía lenguaje prescriptivo, que no se muestra';
const ROTULO_NO_VERIFICADA =
  'Afirmación no verificada contra la fuente citada; se muestra solo para revisión';
const NOTA_LENGUAJE =
  'Se omitió por la redacción generada (lenguaje prescriptivo); no es una valoración de la evidencia';
const TITULO = 'Descartadas en la verificación — solo para revisión';
const TEXTO_NO_MOSTRADO = '(texto no mostrado)';
const PRESCRIPTIVO = 'el mejor tratamiento';

function conDescartada(base: { discardedOptions: object[] }, descartada: object) {
  return { ...base, discardedOptions: [descartada] };
}

async function expandir(cuerpo: object) {
  bff.responder({ status: 200, cuerpo });
  const usuario = await analizar();
  await usuario.click(await screen.findByRole('button', { name: TITULO }));
  return within(document.getElementById('descartadas')!);
}

describe('EvidencePanel · motivo de descarte separado', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('dice sin soporte en el resumen y rotula cada afirmación sin hablar de lenguaje prescriptivo cuando todas las descartadas son afirmacion_sin_soporte [US-246 AC-1]', async () => {
    const seccion = await expandir(conEvidenciaSoloDescartadas);

    const resumen = screen.getByText(evidence.discarded.motivos).parentElement!;
    expect(within(resumen).getByText(ETIQUETA_SIN_SOPORTE)).toBeTruthy();
    const afirmacion = seccion.getByText('reduce la mortalidad a la mitad');
    expect(afirmacion.parentElement?.textContent).toContain(ROTULO_NO_VERIFICADA);
    expect(document.body.textContent).not.toMatch(/lenguaje prescriptivo/i);
  });

  it('muestra solo el nombre y la nota de redacción, sin afirmaciones ni texto prescriptivo ni sin soporte, cuando todas las descartadas son lenguaje_no_permitido [US-246 AC-2]', async () => {
    const seccion = await expandir(soloDescartadasLenguaje);

    const resumen = screen.getByText(evidence.discarded.motivos).parentElement!;
    expect(within(resumen).getByText(ETIQUETA_LENGUAJE)).toBeTruthy();
    for (const { option } of soloDescartadasLenguaje.discardedOptions)
      expect(seccion.getByText(option)).toBeTruthy();
    expect(seccion.getAllByText(NOTA_LENGUAJE)).toHaveLength(
      soloDescartadasLenguaje.discardedOptions.length,
    );
    expect(document.body.textContent).not.toContain('afirmación retirada');
    expect(document.body.textContent).not.toContain(ROTULO_NO_VERIFICADA);
    expect(document.body.textContent).not.toContain(TEXTO_NO_MOSTRADO);
    expect(document.body.textContent).not.toMatch(/no tiene soporte/i);
  });

  it('sustituye el nombre por (texto no mostrado) cuando el filtro RN-23 rechaza la opción de una descartada de lenguaje [US-246 AC-2]', async () => {
    const seccion = await expandir(
      conDescartada(soloDescartadasLenguaje, {
        ...soloDescartadasLenguaje.discardedOptions[0]!,
        option: `Debe recibir ${PRESCRIPTIVO}`,
      }),
    );

    expect(seccion.getByText(TEXTO_NO_MOSTRADO)).toBeTruthy();
    expect(seccion.getByText(NOTA_LENGUAJE)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/debe recibir/i);
  });

  it('muestra una línea por motivo con su recuento y ninguna frase que junte ambos cuando hay una descartada de cada motivo [US-246 AC-3]', async () => {
    await expandir(soloDescartadasSinSoporteYLenguaje);

    const resumen = screen.getByText(evidence.discarded.motivos).parentElement!;
    const lineas = within(resumen)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(lineas).toEqual([`1 × ${ETIQUETA_SIN_SOPORTE}`, `1 × ${ETIQUETA_LENGUAJE}`]);
    expect(document.body.textContent).not.toMatch(/soporte[^.]*lenguaje|lenguaje[^.]*soporte/i);
  });

  it('muestra (texto no mostrado) sin rótulo y conserva el motivo recibido cuando el filtro RN-23 rechaza la afirmación [US-246 AC-1]', async () => {
    const seccion = await expandir(
      conDescartada(conEvidenciaSoloDescartadas, {
        ...conEvidenciaSoloDescartadas.discardedOptions[0]!,
        unsupportedClaims: [`es ${PRESCRIPTIVO} para la paciente`],
      }),
    );

    expect(seccion.getByText(TEXTO_NO_MOSTRADO)).toBeTruthy();
    expect(seccion.getByText(ETIQUETA_SIN_SOPORTE)).toBeTruthy();
    expect(document.body.textContent).not.toContain(ROTULO_NO_VERIFICADA);
    expect(document.body.textContent).not.toContain(PRESCRIPTIVO);
  });

  it('muestra el literal (texto no mostrado) del backend sin rótulo y conserva el motivo cuando la afirmación ya llega retirada [US-246 AC-1]', async () => {
    const seccion = await expandir(
      conDescartada(conEvidenciaSoloDescartadas, {
        ...conEvidenciaSoloDescartadas.discardedOptions[0]!,
        unsupportedClaims: [TEXTO_NO_MOSTRADO],
      }),
    );

    expect(seccion.getByText(TEXTO_NO_MOSTRADO)).toBeTruthy();
    expect(seccion.getByText(ETIQUETA_SIN_SOPORTE)).toBeTruthy();
    expect(document.body.textContent).not.toContain(ROTULO_NO_VERIFICADA);
  });

  it('separa las etiquetas en es.json, pasa la lista de términos prohibidos y mantiene visible el aviso de IA [US-246 AC-4]', async () => {
    const { discardReason, discarded } = mensajes().evidence;
    expect(discardReason.afirmacion_sin_soporte).toBe(ETIQUETA_SIN_SOPORTE);
    expect(discardReason.lenguaje_no_permitido).toBe(ETIQUETA_LENGUAJE);
    expect(discarded.titulo).toBe(TITULO);
    expect(mensajes().app.academicUseLabel).toBe('Uso académico/investigación');

    const lista = loadProhibitedTerms(
      new URL(
        '../../../../packages/clinical-catalogs/lenguaje/terminos-prohibidos.json',
        import.meta.url,
      ),
    );
    for (const { clave, texto } of [
      ...aplanarMensajes(discardReason),
      ...aplanarMensajes(discarded),
    ]) {
      const hallazgos = checkProhibitedTerms(texto, lista, {
        niveles: ['A', 'B'],
        permitirFrases: true,
      });
      expect(hallazgos.map((h) => `${clave}: ${h.termino}`)).toEqual([]);
    }

    await expandir(soloDescartadasLenguaje);
    const avisos = screen.getAllByRole('note');
    expect(avisos.length).toBeGreaterThan(0);
    for (const aviso of avisos) {
      expect(aviso.textContent).toContain(
        'Generado por IA; requiere validación clínica independiente por el oncólogo tratante',
      );
    }
  });

  it('muestra el estado de error existente sin resultado parcial ni el valor crudo cuando una descartada trae un discardReason desconocido [US-246 AC-5]', async () => {
    bff.responder({
      status: 200,
      cuerpo: conDescartada(conEvidenciaSoloDescartadas, {
        ...conEvidenciaSoloDescartadas.discardedOptions[0]!,
        discardReason: 'motivo_de_un_backend_mas_nuevo',
      }),
    });
    await analizar();

    expect(await screen.findByText(evidence.error.generico)).toBeTruthy();
    expect(screen.getByRole('button', { name: evidence.error.reintentar })).toBeTruthy();
    expect(screen.queryByRole('button', { name: TITULO })).toBeNull();
    expect(document.body.textContent).not.toContain('motivo_de_un_backend_mas_nuevo');
  });
});
