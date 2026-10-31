// @vitest-environment jsdom
import { resolve } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { aplanarMensajes } from '../../../../packages/clinical-language/src/aplanar-mensajes';
import { checkProhibitedTerms } from '../../../../packages/clinical-language/src/check-prohibited-terms';
import { loadProhibitedTerms } from '../../../../packages/clinical-language/src/load-prohibited-terms';
import DashboardLayout from '../../app/(dashboard)/layout';
import { EvidencePanel } from '../../components/organisms/evidence-panel';
import { mensajes } from '../../lib/mensajes';
import { abrirTabla, fx08ba } from '../support/aplicabilidad-ui';
import {
  conEvidenciaPoblacionA_M2,
  conEvidenciaPoblacionA_M2B,
  crearBffAnalisisSimulado,
} from '../support/msw/evidence-analyses';
import { analizar, evidence, ID_PACIENTE, PREGUNTA_DE_PRUEBA } from '../support/panel-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const bff = crearBffAnalisisSimulado();
const lista = loadProhibitedTerms(
  resolve(
    import.meta.dirname,
    '../../../../packages/clinical-catalogs/lenguaje/terminos-prohibidos.json',
  ),
);
// El aviso sale de la respuesta (RN-19): el literal no se copia a los tests (US-069 AC-2).
const AVISO_IA = String(fx08ba().disclaimer).replace(/\.$/, '');

/** Texto visible fuera de las hojas copiadas del corpus, como lo recorre la lista de US-068 (design D5). */
function textosPropios(raiz: HTMLElement): string[] {
  const textos: string[] = [];
  const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
    const texto = nodo.textContent?.trim();
    if (texto && !nodo.parentElement?.closest('[data-origen="corpus"]')) textos.push(texto);
  }
  return textos;
}

describe('Tabla de aplicabilidad · regresión RN-23, RN-26 y RN-19', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('no contiene términos prohibidos en sus literales ni en el texto de la tabla con todos los motivos de Parcial y Desconocido [RN-23]', async () => {
    const literales = aplanarMensajes(mensajes().evidence.aplicabilidad);
    for (const { clave, texto } of literales) {
      const hallazgos = checkProhibitedTerms(texto, lista, {
        niveles: ['A', 'B'],
        permitirFrases: true,
      });
      expect(hallazgos.map((h) => `${clave}: ${h.termino}`)).toEqual([]);
    }

    bff.responder({ status: 200, cuerpo: conEvidenciaPoblacionA_M2B });
    const usuario = await analizar();
    for (const indice of [0, 1, 2]) await abrirTabla(usuario, indice);
    const visibles = textosPropios(screen.getByTestId('analysis-result'));
    expect(visibles.some((t) => /Desconocido · los fragmentos citados/.test(t))).toBe(true);
    for (const texto of visibles) {
      expect(checkProhibitedTerms(texto, lista, { niveles: ['A'] }).map((h) => h.termino)).toEqual(
        [],
      );
    }
  });

  it('mantiene habilitados el formulario y Ver fragmento cuando la tabla muestra avisos [RN-26]', async () => {
    bff.responder({ status: 200, cuerpo: fx08ba() });
    const usuario = await analizar();
    const tabla = await abrirTabla(usuario);

    expect(within(tabla).getAllByText(/Desconocido ·/).length).toBeGreaterThan(0);
    expect(within(tabla).getByText('Dato del paciente sin verificar')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: evidence.formulario.analizar }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByLabelText(evidence.formulario.pregunta) as HTMLTextAreaElement).disabled,
    ).toBe(false);
    await usuario.click(screen.getByRole('button', { name: /NCI PDQ/ }));
    expect(
      (screen.getByRole('button', { name: evidence.cita.verFragmento }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(tabla.querySelector('[disabled], [aria-disabled="true"]')).toBeNull();
  });

  it('conserva el aviso de IA en la región note y la etiqueta académica en la cabecera cuando la tabla de doc-a1 está desplegada [RN-19]', async () => {
    bff.responder({ status: 200, cuerpo: fx08ba() });
    const usuario = userEvent.setup();
    render(
      <DashboardLayout>
        <EvidencePanel patientId={ID_PACIENTE} />
      </DashboardLayout>,
    );
    await usuario.type(screen.getByLabelText(evidence.formulario.pregunta), PREGUNTA_DE_PRUEBA);
    await usuario.click(screen.getByRole('button', { name: evidence.formulario.analizar }));
    await abrirTabla(usuario);

    const avisos = screen.getAllByRole('note');
    expect(avisos.length).toBeGreaterThan(0);
    for (const aviso of avisos) expect(aviso.textContent).toContain(AVISO_IA);
    expect(
      within(screen.getByRole('banner')).getByText(mensajes().app.academicUseLabel),
    ).toBeTruthy();
  });

  it('conserva el aviso de IA cuando el análisis trae la tabla de A-M2 con todos sus motivos [RN-19]', async () => {
    bff.responder({ status: 200, cuerpo: conEvidenciaPoblacionA_M2 });
    const usuario = await analizar();
    await abrirTabla(usuario, 0);

    for (const aviso of screen.getAllByRole('note')) {
      expect(aviso.textContent).toBe(conEvidenciaPoblacionA_M2.disclaimer);
    }
  });
});
