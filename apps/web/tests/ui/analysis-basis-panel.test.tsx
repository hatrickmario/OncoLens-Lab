// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnalysisResult } from '../../components/organisms/analysis-result';
import {
  conEvidencia,
  crearBffAnalisisSimulado,
  sinEvidencia,
  tipoNoHabilitado,
} from '../support/msw/evidence-analyses';
import { analizar, SIN_BASE } from '../support/panel-ui';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const bff = crearBffAnalisisSimulado();

const SUPUESTO_DE_CATALOGO = 'Supuesto de prueba de la regla del catálogo';
const VER_DETALLE = 'Ver detalle de la Base';

/** Respuesta de [US-066 AC-1] derivada de `con-evidencia-s1.json` (el ejemplo no se edita). */
const conBaseDeUs066 = {
  ...conEvidencia,
  analysisBasis: {
    ...conEvidencia.analysisBasis,
    missingCriticalData: [],
    missingCriticalDataLabels: [],
    continuedWithWarning: false,
    assumptions: [],
    omittedClaims: 0,
  },
};

const ETIQUETAS_F_M2 = [
  'Grado histológico',
  'Receptor de progesterona',
  'HER2 por ISH',
  'Ki-67',
  'Estado menopáusico',
  'BRCA germinal',
];
const CLAVES_F_M2 = ['grado', 'rp', 'her2_ish', 'ki67', 'estado_menopausico', 'brca_germinal'];

/** Respuesta de [US-128 AC-1] (F-M2) derivada de `con-evidencia-s1.json`: seis faltantes y continuó con aviso. */
const conSeisFaltantes = {
  ...conEvidencia,
  analysisBasis: {
    ...conEvidencia.analysisBasis,
    missingCriticalData: CLAVES_F_M2,
    missingCriticalDataLabels: ETIQUETAS_F_M2,
    continuedWithWarning: true,
    assumptions: [],
    omittedClaims: 0,
  },
};

function conBase(parche: object) {
  return { ...conBaseDeUs066, analysisBasis: { ...conBaseDeUs066.analysisBasis, ...parche } };
}

describe('AnalysisBasisPanel', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    replace.mockReset();
  });

  it('muestra el resumen con cero datos críticos faltantes, supuestos, fuentes no incluidas, omitidas y la fecha 30/09/2026 sin el supuesto declarado sin expandir [US-067 AC-1]', async () => {
    bff.responder({ status: 200, cuerpo: conBaseDeUs066 });
    await analizar();

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Base del análisis' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        '0 datos críticos faltantes · Supuestos: 0 · Fuentes no incluidas: NCCN, ESMO · Afirmaciones omitidas: 0',
      ),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('aún no se calculan');
    expect(screen.getByText('Evidencia del corpus al 30/09/2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: VER_DETALLE })).toBeTruthy();
  });

  it('muestra datos usados con su revisión en texto y fuentes con fragmentos recuperados y sobre el umbral al expandir [US-067 AC-2]', async () => {
    bff.responder({
      status: 200,
      cuerpo: conBase({
        patientDataUsed: [
          { label: 'HER2 3+ (IHQ)', reviewStatus: 'requiere_revision', conflict: true },
          { label: 'Estadio IIA (TNM_8)', reviewStatus: 'verificado', conflict: false },
        ],
      }),
    });
    const usuario = await analizar();
    await usuario.click(await screen.findByRole('button', { name: VER_DETALLE }));

    expect(
      screen.getByRole('heading', { level: 4, name: 'Datos del paciente usados' }),
    ).toBeTruthy();
    expect(screen.getByText('HER2 3+ (IHQ): Por revisar · En conflicto')).toBeTruthy();
    expect(screen.getByText('Estadio IIA (TNM_8): Verificado')).toBeTruthy();
    expect(screen.getByText('Fuentes consultadas')).toBeTruthy();
    expect(screen.getByText('40 fragmentos recuperados · 1 sobre el umbral')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ocultar detalle' })).toBeTruthy();
  });

  it('en el detalle las fuentes no incluidas dicen fuente no incluida; su contenido no se consultó [US-067 AC-2]', async () => {
    bff.responder({ status: 200, cuerpo: conBaseDeUs066 });
    const usuario = await analizar();
    await screen.findByRole('button', { name: VER_DETALLE });
    expect(screen.queryByText(/fuente no incluida; su contenido/)).toBeNull();
    await usuario.click(screen.getByRole('button', { name: VER_DETALLE }));

    for (const fuente of ['NCCN', 'ESMO']) {
      expect(
        screen.getByText(`${fuente}: fuente no incluida; su contenido no se consultó`),
      ).toBeTruthy();
    }
  });

  it('rotula Limitación estructural la limitación de origin estructural [US-067 AC-2]', async () => {
    bff.responder({
      status: 200,
      cuerpo: conBase({ assumptions: [{ text: SUPUESTO_DE_CATALOGO, origin: 'regla_catalogo' }] }),
    });
    const usuario = await analizar();
    await usuario.click(await screen.findByRole('button', { name: VER_DETALLE }));

    expect(
      screen.getByText('Limitación estructural: Síntesis basada en una sola fuente.'),
    ).toBeTruthy();
    expect(screen.getByText(`Regla del catálogo: ${SUPUESTO_DE_CATALOGO}`)).toBeTruthy();
  });

  it('dice qué fuentes y filtros se buscaron y 0 fragmentos sobre el umbral sin expandir cuando no hay evidencia [US-067 AC-3]', async () => {
    bff.responder({ status: 200, cuerpo: sinEvidencia });
    await analizar();

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Base del análisis' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Qué se buscó: fuentes Guías, Publicaciones · filtros solo biomarcadores relevantes, últimos 6 meses, publicado desde 2021 · 0 fragmentos sobre el umbral',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: SIN_BASE })).toBeNull();
  });

  it('dice filtros ninguno cuando no hay filtros aplicados y no hay evidencia [US-067 AC-3]', async () => {
    bff.responder({
      status: 200,
      cuerpo: {
        ...sinEvidencia,
        analysisBasis: {
          ...sinEvidencia.analysisBasis,
          sourcesConsulted: {
            ...sinEvidencia.analysisBasis.sourcesConsulted,
            filters: {
              historiaCompleta: false,
              soloBiomarcadoresRelevantes: false,
              ultimosSeisMeses: false,
              antecedentesFamiliares: false,
              publishedFromYear: null,
            },
          },
        },
      },
    });
    await analizar();

    expect(
      await screen.findByText(
        'Qué se buscó: fuentes Guías, Publicaciones · filtros ninguno · 0 fragmentos sobre el umbral',
      ),
    ).toBeTruthy();
  });

  it('dice No se consultó el corpus: tipo fuera de alcance ante tipo_no_habilitado [US-067 AC-3]', () => {
    render(<AnalysisResult analisis={tipoNoHabilitado as never} onVerFragmento={() => {}} />);

    expect(
      screen.getByText(
        'No se consultó el corpus: tipo fuera de alcance · Datos críticos faltantes: no evaluados en este estado',
      ),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('0 datos críticos faltantes');
    expect(screen.queryByText(/Qué se buscó/)).toBeNull();
  });

  it('muestra Afirmaciones omitidas: 1 y nunca el texto de la afirmación cuando omittedClaims es 1 [US-067 AC-4]', async () => {
    const textoOmitido = 'Afirmación omitida de prueba';
    // El esquema del contrato rechaza campos extra en el borde, así que el campo no contractual se
    // inyecta directo al organismo: si el panel lo pintara alguna vez, esta aserción lo detectaría.
    const analisis = conBase({ omittedClaims: 1, omittedClaimTexts: [textoOmitido] });
    render(<AnalysisResult analisis={analisis as never} onVerFragmento={() => {}} />);

    expect(screen.getByText(/Afirmaciones omitidas: 1$/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(textoOmitido);
    await userEvent.click(screen.getByRole('button', { name: VER_DETALLE }));
    expect(screen.getByText(/Afirmaciones omitidas: 1$/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(textoOmitido);
  });

  it('el botón de la Base cambia aria-expanded de false a true al activarlo con teclado [US-067 AC-5]', async () => {
    bff.responder({ status: 200, cuerpo: conBaseDeUs066 });
    const usuario = await analizar();
    const boton = await screen.findByRole('button', { name: VER_DETALLE });
    expect(boton.getAttribute('aria-expanded')).toBe('false');

    for (let i = 0; i < 40 && document.activeElement !== boton; i++) await usuario.tab();
    expect(document.activeElement).toBe(boton);
    await usuario.keyboard('{Enter}');

    expect(boton.getAttribute('aria-expanded')).toBe('true');
    const detalle = document.getElementById(boton.getAttribute('aria-controls')!);
    expect(detalle?.hasAttribute('hidden')).toBe(false);
    expect(detalle?.textContent).toContain('Datos del paciente usados');

    await usuario.keyboard(' ');
    expect(boton.getAttribute('aria-expanded')).toBe('false');
  });

  it('lista dos datos con la misma etiqueta como dos elementos sin advertencias de React cuando 186 emite etiquetas idénticas', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dato = { label: 'HER2 3+ (IHQ)', reviewStatus: 'verificado', conflict: false };
    bff.responder({ status: 200, cuerpo: conBase({ patientDataUsed: [dato, dato] }) });
    const usuario = await analizar();
    await usuario.click(await screen.findByRole('button', { name: VER_DETALLE }));

    expect(screen.getAllByText('HER2 3+ (IHQ): Verificado')).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('usa ids distintos para el control y el detalle cuando hay dos paneles de Base', () => {
    render(
      <>
        <AnalysisResult analisis={conBaseDeUs066 as never} onVerFragmento={() => {}} />
        <AnalysisResult analisis={conBaseDeUs066 as never} onVerFragmento={() => {}} />
      </>,
    );
    const ids = screen
      .getAllByRole('button', { name: VER_DETALLE })
      .map((boton) => boton.getAttribute('aria-controls'));

    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
  });

  it('dice 6 datos críticos faltantes · continuó con aviso sin expandir cuando continuedWithWarning es true [US-128 AC-4]', async () => {
    bff.responder({ status: 200, cuerpo: conSeisFaltantes });
    await analizar();

    expect(
      await screen.findByText(
        '6 datos críticos faltantes · continuó con aviso · Supuestos: 0 · Fuentes no incluidas: NCCN, ESMO · Afirmaciones omitidas: 0',
      ),
    ).toBeTruthy();
  });

  it('dice 1 dato crítico faltante y no continuó con aviso cuando falta uno y continuedWithWarning es false [US-128 AC-4]', async () => {
    bff.responder({
      status: 200,
      cuerpo: conBase({
        missingCriticalData: ['ki67'],
        missingCriticalDataLabels: ['Ki-67'],
        continuedWithWarning: false,
      }),
    });
    await analizar();

    const resumen = await screen.findByText(/^1 dato crítico faltante · Supuestos: 0/);
    expect(resumen.textContent).not.toContain('continuó con aviso');
    expect(document.body.textContent).not.toContain('1 datos críticos');
  });

  it('lista las seis etiquetas del catálogo con la nota Solo informa; no bloquea el análisis y ninguna clave al expandir [US-128 AC-4]', async () => {
    bff.responder({ status: 200, cuerpo: conSeisFaltantes });
    const usuario = await analizar();
    await usuario.click(await screen.findByRole('button', { name: VER_DETALLE }));

    expect(
      screen.getByRole('heading', { level: 4, name: 'Datos críticos faltantes' }),
    ).toBeTruthy();
    expect(screen.getByText('Solo informa; no bloquea el análisis')).toBeTruthy();
    const etiquetas = screen
      .getAllByRole('listitem')
      .map((item) => item.textContent)
      .filter((texto) => ETIQUETAS_F_M2.includes(texto ?? ''));
    expect(etiquetas).toEqual(ETIQUETAS_F_M2);
    for (const clave of CLAVES_F_M2) expect(screen.queryByText(clave)).toBeNull();
  });

  it('no muestra Datos críticos faltantes cuando la lista está vacía [US-128 AC-4]', async () => {
    bff.responder({ status: 200, cuerpo: conBaseDeUs066 });
    const usuario = await analizar();
    await usuario.click(await screen.findByRole('button', { name: VER_DETALLE }));

    expect(screen.queryByRole('heading', { name: 'Datos críticos faltantes' })).toBeNull();
    expect(screen.queryByText('Solo informa; no bloquea el análisis')).toBeNull();
  });

  it('dice Datos críticos faltantes: no evaluados en este estado y no 0 datos críticos faltantes cuando el tipo no está habilitado [US-128 AC-4]', () => {
    render(<AnalysisResult analisis={tipoNoHabilitado as never} onVerFragmento={() => {}} />);

    expect(document.body.textContent).toContain(
      'Datos críticos faltantes: no evaluados en este estado',
    );
    expect(document.body.textContent).not.toContain('0 datos críticos faltantes');
  });
});
