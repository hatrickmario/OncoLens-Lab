// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HistoricoDelDato } from '../../components/molecules/historico-del-dato';
import type { DatoCorregible } from '../../lib/correcciones/cliente';
import { mensajes } from '../../lib/mensajes';
import {
  crearBffDeCorreccionSimulado,
  historicoDeBiomarcador,
  historicoDeNota,
  ID_DEL_PACIENTE,
} from '../support/correccion-ui';
import { historicoDeAtributo, historicoDeTratamiento } from '../support/correccion-caso-ui';

const bff = crearBffDeCorreccionSimulado();
const { historico } = mensajes().ficha.correccion;

describe('HistoricoDelDato', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it.each<[DatoCorregible, unknown, string]>([
    ['biomarkers', historicoDeBiomarcador, '20 %'],
    ['clinical-notes', historicoDeNota, 'Hipertensión arterial en tratamiento.'],
    ['prior-treatments', historicoDeTratamiento, 'AC-T'],
    ['clinical-attributes', historicoDeAtributo, 'Posmenopáusica'],
  ])('muestra la versión anterior de %s con su texto propio', async (dato, ejemplo, esperado) => {
    const rutas = {
      biomarkers: bff.historicoDeBiomarcador,
      'clinical-notes': bff.historicoDeNota,
      'prior-treatments': bff.historicoDeTratamiento,
      'clinical-attributes': bff.historicoDeAtributo,
    };
    rutas[dato](ejemplo as never);
    render(
      <HistoricoDelDato dato={{ pacienteId: ID_DEL_PACIENTE, dato, id: 'x' }} hoy="2026-09-22" />,
    );

    await userEvent.setup().click(screen.getByRole('button', { name: historico.abrir }));

    const lista = await screen.findByRole('list', { name: historico.etiqueta });
    expect(
      within(lista).getAllByText(new RegExp(esperado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .length,
    ).toBeGreaterThan(0);
  });
});
