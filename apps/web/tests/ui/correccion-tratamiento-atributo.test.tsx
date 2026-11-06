// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import atributoCorreccion from '../../../../contracts/examples/clinical-attribute-correction-request.json';
import tratamientoCorreccion from '../../../../contracts/examples/prior-treatment-correction-request.json';
import { mensajes } from '../../lib/mensajes';
import {
  atributoVigente,
  casoConDatos,
  casoConDeclaracion,
  casoSinDatos,
  crearBffDeCorreccionDeCaso,
  errorCorreccionFechaFin,
  errorDatoNoVigente,
  errorDeclaracionIncoherente,
  errorValorFueraDeCatalogo,
  HOY,
  ID_ATRIBUTO,
  ID_DECLARACION,
  ID_TRATAMIENTO,
  montarCasoParaCorregir,
  tratamientoVigente,
} from '../support/correccion-caso-ui';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh }) }));

const { registro, secciones, sinDatos } = mensajes().caso;
const { tratamiento: t, atributo: a } = registro;
const { correccion: c } = registro;
const { correccion: f } = mensajes().ficha;
const bff = crearBffDeCorreccionDeCaso();

type Usuario = ReturnType<typeof userEvent.setup>;

const corregirTratamiento = (nombre = 'AC-T') =>
  screen.findByRole('button', { name: `Corregir dato · ${nombre}` });
const corregirAtributo = () =>
  screen.findByRole('button', { name: 'Corregir dato · Estado de castración' });

async function abrirTratamiento(usuario: Usuario) {
  await usuario.click(await corregirTratamiento());
  return screen.findByRole('dialog', { name: c.tratamiento.titulo });
}

async function abrirAtributo(usuario: Usuario) {
  await usuario.click(await corregirAtributo());
  return screen.findByRole('dialog', { name: c.atributo.titulo });
}

describe('Corrección de tratamientos previos y atributos en la vista de caso', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
    refresh.mockReset();
  });

  it('corrige el esquema con el cuerpo completo, muestra la fila nueva con Corrección manual y el anterior en el histórico [AC-04.1]', async () => {
    bff.corregirTratamiento(201);
    bff.historicoDeTratamiento();
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    const dialogo = await abrirTratamiento(usuario);

    expect(within(dialogo).getByLabelText(t.esquema)).toHaveProperty('value', 'AC-T');
    await usuario.clear(within(dialogo).getByLabelText(t.esquema));
    await usuario.type(within(dialogo).getByLabelText(t.esquema), 'FEC');
    await usuario.click(within(dialogo).getByRole('button', { name: f.formulario.guardar }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bff.envios()).toHaveLength(1);
    expect(bff.envios()[0]?.ruta).toBe(
      `/api/patients/${'0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10'}/prior-treatments/${ID_TRATAMIENTO}/corrections`,
    );
    expect(bff.envios()[0]?.cuerpo).toEqual(tratamientoCorreccion);
    const fila = await screen.findByRole('row', { name: /FEC/ });
    expect(within(fila).getByText(/Corrección manual/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(f.avisoAnalisisAnteriores);

    await usuario.click(screen.getByRole('button', { name: f.historico.abrir }));
    const historico = await screen.findByRole('list', { name: f.historico.etiqueta });
    expect(within(historico).getByText('AC-T')).toBeTruthy();
    expect(within(historico).getByText(f.historico.reemplazado)).toBeTruthy();
  });

  it('devuelve el foco al botón «Corregir dato» de la fila nueva cuando se guarda la corrección', async () => {
    bff.corregirTratamiento(201);
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    const dialogo = await abrirTratamiento(usuario);

    await usuario.clear(within(dialogo).getByLabelText(t.esquema));
    await usuario.type(within(dialogo).getByLabelText(t.esquema), 'FEC');
    await usuario.click(within(dialogo).getByRole('button', { name: f.formulario.guardar }));

    const nuevo = await corregirTratamiento('FEC');
    await waitFor(() => expect(document.activeElement).toBe(nuevo));
  });

  it('precarga todos los campos del tratamiento, con «En curso» sin los de fin cuando sigue vigente', async () => {
    const usuario = userEvent.setup();
    bff.reiniciar({
      ...casoConDatos,
      priorTreatments: [
        { ...tratamientoVigente, ongoing: true, endedAt: null, endReason: 'desconocido' },
      ],
    });
    montarCasoParaCorregir();
    const dialogo = await abrirTratamiento(usuario);

    expect(within(dialogo).getByLabelText(t.linea)).toHaveProperty('value', '1');
    expect(within(dialogo).getByLabelText(t.contexto)).toHaveProperty('value', 'adyuvante');
    expect(within(dialogo).getByLabelText(t.inicio)).toHaveProperty('value', '2026-03-10');
    expect(within(dialogo).getByLabelText(t.enCurso)).toHaveProperty('checked', true);
    expect(within(dialogo).queryByLabelText(t.fin)).toBeNull();
  });

  it('precarga el fin y su motivo del tratamiento terminado y no ofrece la declaración de ausencia', async () => {
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    const dialogo = await abrirTratamiento(usuario);

    expect(within(dialogo).getByLabelText(t.fin)).toHaveProperty('value', '2026-07-14');
    expect(within(dialogo).getByLabelText(t.motivoDeFin)).toHaveProperty('value', 'completado');
    expect(within(dialogo).queryByRole('checkbox', { name: t.declaracion.casilla })).toBeNull();
  });

  it('señala la fecha de fin junto al campo con aria-live assertive y deja el diálogo abierto cuando el servidor responde 422 con field endedAt', async () => {
    bff.corregirTratamiento(422, errorCorreccionFechaFin);
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    const dialogo = await abrirTratamiento(usuario);

    fireEvent.change(within(dialogo).getByLabelText(t.fin), { target: { value: '2026-01-01' } });
    await usuario.click(within(dialogo).getByRole('button', { name: f.formulario.guardar }));

    const mensaje = await within(dialogo).findByText(f.errores.finAnteriorAlInicio);
    expect(mensaje.closest('[aria-live="assertive"]')).not.toBeNull();
    const campo = within(dialogo).getByLabelText(t.fin);
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toContain(mensaje.id);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      bff.peticiones.filter((p) => p.metodo === 'GET' && p.ruta.endsWith('/case')),
    ).toHaveLength(1);
  });

  it('avisa que no hay cambios cuando el servidor responde 422 sin field', async () => {
    bff.corregirTratamiento(422, {
      error: 'CUERPO_INVALIDO',
      message: 'Sin cambios',
      traceId: 'req_sin_cambios',
    });
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    const dialogo = await abrirTratamiento(usuario);

    await usuario.click(within(dialogo).getByRole('button', { name: f.formulario.guardar }));

    const mensaje = await within(dialogo).findByText(f.errores.sinCambios);
    expect(mensaje.closest('[aria-live="assertive"]')).not.toBeNull();
  });

  it('ofrece recargar la ficha cuando el dato ya fue reemplazado (409)', async () => {
    bff.corregirTratamiento(409, errorDatoNoVigente);
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    const dialogo = await abrirTratamiento(usuario);

    await usuario.click(within(dialogo).getByRole('button', { name: f.formulario.guardar }));

    expect(await within(dialogo).findByText(f.errores.noVigente)).toBeTruthy();
  });

  it('corrige el valor y la fecha del atributo con la clave fija y muestra la fila nueva [AC-04.1]', async () => {
    bff.corregirAtributo(201);
    bff.historicoDeAtributo();
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    const dialogo = await abrirAtributo(usuario);

    expect(within(dialogo).queryByRole('combobox', { name: a.atributo })).toBeNull();
    expect(within(dialogo).getByText('Estado de castración')).toBeTruthy();
    expect(within(dialogo).getByText(c.atributo.claveFija)).toBeTruthy();
    expect(within(dialogo).getByLabelText(a.valor)).toHaveProperty('value', 'sensible_castracion');
    expect(within(dialogo).getByLabelText(a.fecha)).toHaveProperty('value', '2026-08-20');
    await usuario.selectOptions(within(dialogo).getByLabelText(a.valor), 'Castrado');
    fireEvent.change(within(dialogo).getByLabelText(a.fecha), {
      target: { value: atributoCorreccion.observedAt },
    });
    await usuario.click(within(dialogo).getByRole('button', { name: f.formulario.guardar }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bff.envios()[0]?.ruta).toMatch(
      new RegExp(`/clinical-attributes/${ID_ATRIBUTO}/corrections$`),
    );
    expect(bff.envios()[0]?.cuerpo).toEqual({ value: 'castrado', observedAt: '2026-09-02' });
    const fila = await screen.findByRole('row', { name: /Estado de castración/ });
    expect(within(fila).getByText('Castrado')).toBeTruthy();
    expect(within(fila).getByText(/Corrección manual/)).toBeTruthy();

    await usuario.click(screen.getByRole('button', { name: f.historico.abrir }));
    const historico = await screen.findByRole('list', { name: f.historico.etiqueta });
    expect(within(historico).getByText(/Posmenopáusica/)).toBeTruthy();
  });

  it('señala el valor junto al campo cuando el servidor lo rechaza por estar fuera del catálogo', async () => {
    bff.corregirAtributo(422, errorValorFueraDeCatalogo);
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    const dialogo = await abrirAtributo(usuario);

    await usuario.selectOptions(within(dialogo).getByLabelText(a.valor), 'Castrado');
    await usuario.click(within(dialogo).getByRole('button', { name: f.formulario.guardar }));

    const mensaje = await within(dialogo).findByText(f.errores.valorFormato);
    expect(mensaje.closest('[aria-live="assertive"]')).not.toBeNull();
    expect(within(dialogo).getByLabelText(a.valor).getAttribute('aria-invalid')).toBe('true');
    expect(atributoVigente.key).toBe('estado_castracion');
  });

  it('exige elegir un valor antes de enviar la corrección del atributo', async () => {
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    const dialogo = await abrirAtributo(usuario);

    await usuario.selectOptions(within(dialogo).getByLabelText(a.valor), a.elegir);
    await usuario.click(within(dialogo).getByRole('button', { name: f.formulario.guardar }));

    expect(await within(dialogo).findByText(f.errores.obligatorio)).toBeTruthy();
    expect(bff.envios()).toHaveLength(0);
  });

  it('corrige solo la fecha de la declaración de ausencia, con el valor fijo [AC-04.1]', async () => {
    bff.reiniciar(casoConDeclaracion);
    bff.corregirAtributo(201);
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    await usuario.click(
      await screen.findByRole('button', {
        name: `Corregir dato · ${t.declaracion.sinTratamiento}`,
      }),
    );
    const dialogo = await screen.findByRole('dialog', { name: c.declaracion.titulo });

    expect(within(dialogo).queryByLabelText(a.valor)).toBeNull();
    expect(within(dialogo).getByText(c.declaracion.valorFijo)).toBeTruthy();
    fireEvent.change(within(dialogo).getByLabelText(a.fecha), { target: { value: '2026-09-03' } });
    await usuario.click(within(dialogo).getByRole('button', { name: f.formulario.guardar }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(bff.envios()[0]?.ruta).toMatch(
      new RegExp(`/clinical-attributes/${ID_DECLARACION}/corrections$`),
    );
    expect(bff.envios()[0]?.cuerpo).toEqual({ value: 'si', observedAt: '2026-09-03' });
  });

  it('explica que hay tratamientos registrados cuando el servidor rechaza la declaración por incoherente', async () => {
    bff.reiniciar(casoConDeclaracion);
    bff.corregirAtributo(422, errorDeclaracionIncoherente);
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    await usuario.click(
      await screen.findByRole('button', {
        name: `Corregir dato · ${t.declaracion.sinTratamiento}`,
      }),
    );
    const dialogo = await screen.findByRole('dialog', { name: c.declaracion.titulo });

    fireEvent.change(within(dialogo).getByLabelText(a.fecha), { target: { value: '2026-09-03' } });
    await usuario.click(within(dialogo).getByRole('button', { name: f.formulario.guardar }));

    expect(await within(dialogo).findByText(f.errores.declaracionConTratamientos)).toBeTruthy();
  });

  it.each([
    ['tratamiento', 'Corregir dato · AC-T'],
    ['atributo', 'Corregir dato · Estado de castración'],
  ])(
    'deshabilita «Corregir dato» del %s y lo explica cuando el paciente está egresado',
    async (_, nombre) => {
      montarCasoParaCorregir(true);

      const boton = await screen.findByRole('button', { name: nombre });
      expect(boton).toHaveProperty('disabled', true);
      const ayuda = document.getElementById(boton.getAttribute('aria-describedby') ?? '');
      expect(ayuda?.textContent).toBe(f.egresado);
    },
  );

  it('no ofrece «Corregir dato» en las secciones sin datos', async () => {
    bff.reiniciar(casoSinDatos);
    montarCasoParaCorregir();

    for (const nombre of [secciones.tratamientos, secciones.atributos]) {
      const region = await screen.findByRole('region', { name: nombre });
      expect(within(region).getByText(sinDatos)).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: /Corregir dato/ })).toBeNull();
    expect(screen.getByRole('button', { name: t.accion })).toBeTruthy();
  });

  it('muestra la fecha del dato en relativo contra el reloj congelado', async () => {
    montarCasoParaCorregir();

    const fila = await screen.findByRole('row', { name: /Estado de castración/ });
    expect(within(fila).getByText('hace 1 mes').closest('time')?.getAttribute('datetime')).toBe(
      '2026-08-20',
    );
    expect(HOY).toBe('2026-10-01');
  });

  it('cierra con Escape sin enviar nada y devuelve el foco al botón de la fila', async () => {
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    const boton = await corregirTratamiento();
    await usuario.click(boton);
    await screen.findByRole('dialog', { name: c.tratamiento.titulo });

    await usuario.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(boton);
    expect(bff.envios()).toHaveLength(0);
  });

  it('pide el motivo de fin junto a su campo cuando el servidor responde 422 con field endReason', async () => {
    bff.corregirTratamiento(422, { ...errorCorreccionFechaFin, field: 'endReason' });
    const usuario = userEvent.setup();
    montarCasoParaCorregir();
    const dialogo = await abrirTratamiento(usuario);

    await usuario.click(within(dialogo).getByRole('button', { name: f.formulario.guardar }));

    expect(await within(dialogo).findByText(f.errores.motivoDeFin)).toBeTruthy();
    expect(within(dialogo).getByLabelText(t.motivoDeFin).getAttribute('aria-invalid')).toBe('true');
  });
});
