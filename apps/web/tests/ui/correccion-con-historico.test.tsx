// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type {
  Biomarker,
  ClinicalNote,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { NotasClinicasDeFicha } from '../../components/organisms/notas-clinicas-de-ficha';
import { RecentBiomarkersTable } from '../../components/organisms/recent-biomarkers-table';
import { fechaRelativa } from '../../lib/fechas/fecha-relativa';
import { mensajes } from '../../lib/mensajes';
import {
  biomarcadorCorregido,
  corregidaNota,
  crearBffDeCorreccionSimulado,
  errorDatoNoVigente,
  errorFechaFutura,
  errorPermisoDenegado,
  historicoDeBiomarcador,
  historicoDeNota,
  ID_DEL_PACIENTE,
  listaDeNotas,
} from '../support/correccion-ui';
import { fichaDelDoctor } from '../support/ficha-simulado';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { correccion } = mensajes().ficha;
const HOY = '2026-09-22';

/** UUID v4 sintético distinto por prefijo e índice, sin la forma de un número de documento. */
const idDePrueba = (prefijo: string, i: number): string =>
  `${prefijo}3c5e7f1-b2d4-4a6c-9e8f-${(0xa1b2c3d4e5f0 + i).toString(16)}`;
const bff = crearBffDeCorreccionSimulado();
const [her2] = fichaDelDoctor.recentBiomarkers;
if (her2 === undefined) throw new Error('El ejemplo no trae biomarcadores');

function montarTabla(biomarcadores: unknown[] = [her2], egresado = false) {
  render(
    <RecentBiomarkersTable
      biomarcadores={biomarcadores as unknown as Biomarker[]}
      pacienteId={ID_DEL_PACIENTE}
      egresado={egresado}
      hoy={HOY}
    />,
  );
  return userEvent.setup();
}

function montarNotas(notas: unknown[] = listaDeNotas.items, egresado = false) {
  render(
    <NotasClinicasDeFicha
      notas={notas as unknown as ClinicalNote[]}
      pacienteId={ID_DEL_PACIENTE}
      egresado={egresado}
      hoy={HOY}
    />,
  );
  return userEvent.setup();
}

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrirCorreccion(usuario: Usuario) {
  await usuario.click(screen.getByRole('button', { name: /Corregir dato/ }));
}

describe('Corrección con histórico en la ficha', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    refresh.mockReset();
  });

  it('muestra el valor corregido con Corrección manual y el anterior en el histórico desplegable [US-253 AC-1]', async () => {
    bff.historicoDeBiomarcador(historicoDeBiomarcador);
    const usuario = montarTabla([biomarcadorCorregido]);

    const fila = screen.getByRole('row', { name: /Ki-67/ });
    expect(within(fila).getByText(/Corrección manual/)).toBeTruthy();
    expect(within(fila).queryByText(/Verificado/)).toBeNull();
    expect(
      within(fila).getAllByText('hace 12 días').at(-1)?.closest('time')?.getAttribute('datetime'),
    ).toBe('2026-09-10');
    expect(within(fila).getByText(/25 %/)).toBeTruthy();
    const alternar = screen.getByRole('button', { name: /Histórico/ });
    expect(alternar.getAttribute('aria-expanded')).toBe('false');

    await usuario.click(alternar);

    const historico = await screen.findByRole('list', { name: correccion.historico.etiqueta });
    expect(within(historico).getByText(/20 %/)).toBeTruthy();
    expect(within(historico).getByText(/Registro manual/)).toBeTruthy();
    expect(within(historico).getAllByText(correccion.historico.reemplazado).length).toBe(2);
    expect(alternar.getAttribute('aria-expanded')).toBe('true');
  });

  it('muestra la nota nueva y la anterior en el histórico [US-253 AC-2]', async () => {
    bff.historicoDeNota(historicoDeNota);
    const usuario = montarNotas();

    expect(screen.getByText(corregidaNota.content)).toBeTruthy();
    const alternadores = screen.getAllByRole('button', { name: /Histórico/ });
    expect(alternadores).toHaveLength(1);

    await usuario.click(alternadores[0]!);

    const historico = await screen.findByRole('list', { name: correccion.historico.etiqueta });
    expect(within(historico).getByText('Hipertensión arterial en tratamiento.')).toBeTruthy();
    expect(within(historico).getByText(/Carga inicial/)).toBeTruthy();
  });

  it('muestra el error junto al campo con aria-live assertive y deja el formulario abierto [US-253 AC-3]', async () => {
    bff.corregirBiomarcador(422, errorFechaFutura);
    const usuario = montarTabla();
    await abrirCorreccion(usuario);

    await usuario.clear(screen.getByLabelText(correccion.formulario.fecha));
    await usuario.type(screen.getByLabelText(correccion.formulario.fecha), HOY);
    await usuario.click(screen.getByRole('button', { name: correccion.formulario.guardar }));

    const mensaje = await screen.findByText('La fecha no puede ser posterior a hoy.');
    expect(mensaje.closest('[aria-live="assertive"]')).not.toBeNull();
    const campo = screen.getByLabelText(correccion.formulario.fecha);
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toContain(mensaje.id);
    expect(screen.getByRole('button', { name: correccion.formulario.guardar })).toBeTruthy();
    expect(bff.peticiones[0]?.cuerpo).toEqual({ value: '3+ (IHQ)', performedAt: HOY });
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    [
      { error: 'VALOR_FUERA_DE_CATALOGO', field: 'value' },
      'Este valor no coincide con el formato esperado.',
    ],
    [{ error: 'CUERPO_INVALIDO' }, 'No hay cambios respecto de la versión vigente.'],
    [{ error: 'PACIENTE_EGRESADO' }, correccion.egresado],
  ])(
    'muestra el texto fijo de %j y nunca el message del servidor [US-253 AC-3]',
    async (cuerpo, texto) => {
      bff.corregirBiomarcador(422, {
        ...cuerpo,
        message: 'Detalle interno del servidor.',
        traceId: 'req_1',
      });
      const usuario = montarTabla();
      await abrirCorreccion(usuario);

      await usuario.click(screen.getByRole('button', { name: correccion.formulario.guardar }));

      const dentroDelFormulario = await screen.findAllByText(texto);
      expect(dentroDelFormulario.length).toBeGreaterThan(0);
      expect(screen.queryByText('Detalle interno del servidor.')).toBeNull();
    },
  );

  it.each([
    [409, errorDatoNoVigente, correccion.errores.noVigente],
    [403, errorPermisoDenegado, correccion.errores.permiso],
  ])(
    'muestra el aviso fijo y deja el formulario abierto cuando el BFF responde %i [US-253 AC-4]',
    async (status, cuerpo, texto) => {
      bff.corregirBiomarcador(status, cuerpo);
      const usuario = montarTabla();
      await abrirCorreccion(usuario);

      await usuario.click(screen.getByRole('button', { name: correccion.formulario.guardar }));

      expect(await screen.findByText(texto)).toBeTruthy();
      expect(screen.getByRole('button', { name: correccion.formulario.guardar })).toBeTruthy();
    },
  );

  it('deshabilita Corregir dato con el texto de egresado [US-253 AC-4]', () => {
    montarTabla([her2], true);

    const accion = screen.getByRole('button', { name: /Corregir dato/ }) as HTMLButtonElement;
    expect(accion.disabled).toBe(true);
    expect(screen.getByText(correccion.egresado)).toBeTruthy();
  });

  it('muestra el aviso no bloqueante de análisis anteriores tras guardar [US-253 AC-5]', async () => {
    bff.corregirBiomarcador(201, biomarcadorCorregido);
    const usuario = montarTabla();
    await abrirCorreccion(usuario);

    const valor = screen.getByLabelText(correccion.formulario.valor);
    await usuario.clear(valor);
    await usuario.type(valor, '4+');
    await usuario.click(screen.getByRole('button', { name: correccion.formulario.guardar }));

    const aviso = await screen.findByText(correccion.avisoAnalisisAnteriores);
    expect(aviso.closest('[role="status"]')).not.toBeNull();
    expect(bff.peticiones[0]).toMatchObject({ metodo: 'POST', cuerpo: { value: '4+' } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: correccion.formulario.guardar })).toBeNull();
    expect(screen.getByRole('button', { name: /Corregir dato/ })).toBeTruthy();
  });

  it('muestra el aviso fijo de nombres sobre el campo de la nota [US-253 AC-6]', async () => {
    const usuario = montarNotas();

    await usuario.click(screen.getAllByRole('button', { name: /Corregir dato/ })[0]!);

    const dialogo = screen.getByRole('dialog');
    const aviso = within(dialogo).getByText(
      'Las notas no se envían a la IA en esta versión; conviene no incluir nombres de personas en ellas.',
    );
    const campo = within(dialogo).getByLabelText(correccion.formulario.nota);
    expect(aviso.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('muestra la misma fecha relativa que el átomo en el histórico, la nota y la corrección manual para 30 días, 400 días y fecha futura [US-253 AC-1]', async () => {
    const dias = (n: number) =>
      new Date(Date.parse(`${HOY}T00:00:00Z`) - n * 86_400_000).toISOString();
    const fechas = [dias(30), dias(400), dias(-5)];
    const esperadas = fechas.map((fecha) => fechaRelativa(fecha, HOY));
    const textos = (raiz: ParentNode) =>
      [...raiz.querySelectorAll('time')].map((t) => t.textContent);
    bff.historicoDeBiomarcador({
      items: fechas.map((recordedAt, i) => ({
        ...historicoDeBiomarcador.items[0]!,
        id: idDePrueba('0', i),
        recordedAt,
      })),
    });
    const corregidos = fechas.map((performedAt, i) => ({
      ...biomarcadorCorregido,
      id: idDePrueba('1', i),
      name: `Marcador ${i}`,
      performedAt: performedAt.slice(0, 10),
    }));
    const usuario = montarTabla(corregidos);
    for (const [i, nombre] of corregidos.map((c) => c.name).entries()) {
      const origen = within(screen.getByRole('row', { name: new RegExp(nombre) }));
      expect(origen.getAllByText(esperadas[i]!).length).toBeGreaterThan(1);
    }

    await usuario.click(screen.getAllByRole('button', { name: /Histórico/ })[0]!);
    const historico = await screen.findByRole('list', { name: correccion.historico.etiqueta });
    expect(textos(historico)).toEqual(esperadas);
    cleanup();

    montarNotas(
      fechas.map((recordedAt, i) => ({
        ...listaDeNotas.items[1]!,
        id: idDePrueba('2', i),
        recordedAt,
      })),
    );
    expect(textos(document.body)).toEqual(esperadas);
  });

  it('mantiene el aviso de análisis anteriores tras corregir un biomarcador y volver a pintar la fila con otro id [US-253 AC-5]', async () => {
    bff.corregirBiomarcador(201, biomarcadorCorregido);
    const props = { pacienteId: ID_DEL_PACIENTE, egresado: false, hoy: HOY };
    const { rerender } = render(
      <RecentBiomarkersTable biomarcadores={[her2] as unknown as Biomarker[]} {...props} />,
    );
    const usuario = userEvent.setup();
    await abrirCorreccion(usuario);
    await usuario.click(screen.getByRole('button', { name: correccion.formulario.guardar }));
    expect(await screen.findByText(correccion.avisoAnalisisAnteriores)).toBeTruthy();

    rerender(
      <RecentBiomarkersTable
        biomarcadores={
          [
            { ...her2, id: biomarcadorCorregido.id, supersedesId: her2.id },
          ] as unknown as Biomarker[]
        }
        {...props}
      />,
    );

    expect(screen.getByText(correccion.avisoAnalisisAnteriores)).toBeTruthy();
  });

  it('devuelve el foco al botón Corregir dato cuando se cierra el diálogo con Escape [US-253 AC-2]', async () => {
    const usuario = montarNotas();
    const accion = screen.getAllByRole('button', { name: /Corregir dato/ })[0]!;
    await usuario.click(accion);

    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(accion);
  });

  it('contiene el texto oculto de la columna de acciones dentro de su celda para no ensanchar la página en 375 px [US-253 AC-1]', () => {
    montarTabla();

    const cabecera = screen.getByRole('columnheader', { name: 'Acciones' });

    expect(cabecera.classList.contains('relative')).toBe(true);
  });

  it('envía el texto y el tipo de la nota, cierra el diálogo y no muestra el aviso de análisis anteriores [US-253 AC-2]', async () => {
    bff.corregirNota(201, corregidaNota);
    const usuario = montarNotas();
    await usuario.click(screen.getAllByRole('button', { name: /Corregir dato/ })[0]!);

    const campo = screen.getByLabelText(correccion.formulario.nota);
    await usuario.clear(campo);
    await usuario.type(campo, 'Texto corregido.');
    await usuario.click(screen.getByRole('button', { name: correccion.formulario.guardar }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText(correccion.avisoAnalisisAnteriores)).toBeNull();
    expect(bff.peticiones[0]?.cuerpo).toEqual({
      noteType: 'antecedente',
      content: 'Texto corregido.',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('muestra las fechas del histórico en formato relativo con la fecha absoluta en time [US-253 AC-1]', async () => {
    bff.historicoDeBiomarcador(historicoDeBiomarcador);
    const usuario = montarTabla([biomarcadorCorregido]);

    await usuario.click(screen.getByRole('button', { name: /Histórico/ }));

    const historico = await screen.findByRole('list', { name: correccion.historico.etiqueta });
    const fecha = within(historico).getAllByText('hace 12 días')[0]!.closest('time');
    expect(fecha?.getAttribute('datetime')).toBe('2026-09-10');
    expect(fecha?.getAttribute('title')).toBe('10/09/2026');
  });
});

const { formulario } = correccion;
const ki67 = {
  ...biomarcadorCorregido,
  supersedesId: undefined,
  value: '20',
  performedAt: '2026-10-20',
};
const reNegativo = {
  ...her2,
  name: 'RE',
  value: 'Negativo',
  unit: null,
  performedAt: '2026-10-01',
  provenance: { ...her2.provenance, reviewStatus: 'requiere_revision', conflict: true },
};

describe('Corrección en línea: precarga de valor, unidad y fecha del examen', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    refresh.mockReset();
  });

  it('precarga valor, unidad y fecha del examen de Ki-67 [D5 feedback 1]', async () => {
    const usuario = montarTabla([ki67]);
    await abrirCorreccion(usuario);

    expect((screen.getByLabelText(formulario.valor) as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText(formulario.unidad) as HTMLInputElement).value).toBe('%');
    expect((screen.getByLabelText(formulario.fecha) as HTMLInputElement).value).toBe('2026-10-20');
  });

  it('indica Unidad (opcional) con Sin unidad y ayuda en RE cualitativo sin unidad [D5 feedback 1]', async () => {
    const usuario = montarTabla([reNegativo]);
    await abrirCorreccion(usuario);

    const unidad = screen.getByLabelText('Unidad (opcional)') as HTMLInputElement;
    expect(unidad.value).toBe('');
    expect(unidad.getAttribute('placeholder')).toBe('Sin unidad');
    const ayuda = screen.getByText('Déjala vacía si el resultado no lleva unidad.');
    expect(unidad.getAttribute('aria-describedby')).toContain(ayuda.id);
    expect(screen.getByLabelText('Fecha del examen')).toBeTruthy();
  });

  it('conserva ng/mL precargada y envía null al borrar la unidad [D5 feedback 1]', async () => {
    bff.corregirBiomarcador(201, biomarcadorCorregido);
    const psa = { ...ki67, name: 'PSA', value: '4,2', unit: 'ng/mL' };
    const usuario = montarTabla([psa]);
    await abrirCorreccion(usuario);
    const unidad = screen.getByLabelText(formulario.unidad) as HTMLInputElement;
    expect(unidad.value).toBe('ng/mL');

    await usuario.clear(unidad);
    await usuario.click(screen.getByRole('button', { name: formulario.guardar }));

    await waitFor(() => expect(bff.peticiones).toHaveLength(1));
    expect(bff.peticiones[0]?.cuerpo).toEqual({ value: '4,2', unit: null });
  });

  it('envía performedAt solo si la fecha cambió [D5 feedback 1]', async () => {
    bff.corregirBiomarcador(201, biomarcadorCorregido);
    const usuario = montarTabla([ki67]);
    await abrirCorreccion(usuario);
    const fecha = screen.getByLabelText(formulario.fecha);
    await usuario.clear(fecha);
    await usuario.type(fecha, '2026-10-21');
    await usuario.click(screen.getByRole('button', { name: formulario.guardar }));

    await waitFor(() => expect(bff.peticiones).toHaveLength(1));
    expect(bff.peticiones[0]?.cuerpo).toEqual({ value: '20', unit: '%', performedAt: '2026-10-21' });
  });

  it('no desplaza la fecha por zona horaria cuando el reloj está en UTC-5 [D5 feedback 1]', async () => {
    const zona = process.env.TZ;
    process.env.TZ = 'America/Bogota';
    try {
      const usuario = montarTabla([reNegativo]);
      await abrirCorreccion(usuario);

      expect((screen.getByLabelText(formulario.fecha) as HTMLInputElement).value).toBe('2026-10-01');
    } finally {
      if (zona === undefined) delete process.env.TZ;
      else process.env.TZ = zona;
    }
  });

  it('rechaza una fecha futura junto al campo sin enviar y limita max al hoy del servidor [D5 feedback 1]', async () => {
    const usuario = montarTabla([ki67]);
    await abrirCorreccion(usuario);
    const fecha = screen.getByLabelText(formulario.fecha);
    expect(fecha.getAttribute('max')).toBe(HOY);

    await usuario.clear(fecha);
    await usuario.type(fecha, '2099-01-01');
    await usuario.click(screen.getByRole('button', { name: formulario.guardar }));

    const mensaje = await screen.findByText(correccion.errores.fechaFutura);
    expect(fecha.getAttribute('aria-describedby')).toContain(mensaje.id);
    expect(bff.peticiones).toHaveLength(0);
  });

  it('corrige un dato por revisar y en conflicto con una corrección nueva, sin sobrescribir [RN-08, D5 feedback 1]', async () => {
    bff.corregirBiomarcador(201, biomarcadorCorregido);
    const usuario = montarTabla([reNegativo]);
    await abrirCorreccion(usuario);
    const valor = screen.getByLabelText(formulario.valor);
    await usuario.clear(valor);
    await usuario.type(valor, 'Positivo');
    await usuario.click(screen.getByRole('button', { name: formulario.guardar }));

    await waitFor(() => expect(bff.peticiones).toHaveLength(1));
    expect(bff.peticiones[0]).toMatchObject({
      metodo: 'POST',
      url: expect.stringContaining(`/biomarkers/${her2.id}/corrections`),
      cuerpo: { value: 'Positivo' },
    });
    expect(await screen.findByText(correccion.avisoAnalisisAnteriores)).toBeTruthy();
  });
});
