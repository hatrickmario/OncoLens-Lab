// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { zClinicalAttributeManualCreate } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { mensajes } from '../../lib/mensajes';
import {
  casoConDeclaracion,
  casoPCaso,
  casoVacio,
  checklistDeclarado,
  checklistFaltante,
  crearBffDeDeclaracionSimulado,
  errorIncoherente,
  montarCasoParaDeclarar,
} from '../support/declaracion-ausencia-ui';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const { registro, secciones, sinDatos } = mensajes().caso;
const { tratamiento: t, errores } = registro;
const d = t.declaracion;
const bff = crearBffDeDeclaracionSimulado({ caso: casoVacio, checklist: checklistFaltante });

type Usuario = ReturnType<typeof userEvent.setup>;

async function abrirDesdeElChecklist(usuario: Usuario) {
  const disparador = await screen.findByRole('button', {
    name: mensajes().datosCriticos.acciones.agregarTratamiento,
  });
  await usuario.click(disparador);
  return { disparador, dialogo: await screen.findByRole('dialog', { name: t.titulo }) };
}

async function abrirDesdeLaSeccion(usuario: Usuario) {
  const disparador = await screen.findByRole('button', { name: t.accion });
  await usuario.click(disparador);
  return { disparador, dialogo: await screen.findByRole('dialog', { name: t.titulo }) };
}

const seccionDeTratamientos = () =>
  within(screen.getByRole('region', { name: secciones.tratamientos }));

describe('Declaración «Sin tratamiento previo a la fecha» en el diálogo de tratamientos previos', () => {
  beforeAll(bff.iniciar);
  afterAll(bff.detener);
  afterEach(() => {
    cleanup();
    bff.reiniciar();
  });

  it('envía una única petición válida sin errores de los campos ocultos y la fila deja de ser Faltante sin recargar [AC-04.1]', async () => {
    bff.aceptarDeclaracion();
    const usuario = userEvent.setup();
    montarCasoParaDeclarar();
    const { dialogo } = await abrirDesdeElChecklist(usuario);

    await usuario.click(within(dialogo).getByRole('checkbox', { name: d.casilla }));
    await usuario.click(within(dialogo).getByRole('button', { name: registro.guardar }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const envios = bff.envios();
    expect(envios).toHaveLength(1);
    expect(envios[0]?.ruta).toMatch(/\/api\/patients\/[^/]+\/clinical-attributes$/);
    expect(envios[0]?.cuerpo).toEqual({
      attributeKey: 'sin_tratamiento_previo',
      value: 'si',
      observedAt: '2026-10-01',
    });
    expect(zClinicalAttributeManualCreate.safeParse(envios[0]?.cuerpo).success).toBe(true);
    expect(screen.queryByText(errores.obligatorio)).toBeNull();
    const datos = within(screen.getByRole('region', { name: 'Datos críticos' }));
    await waitFor(() => {
      const fila = datos
        .getAllByRole('listitem')
        .find((li) => li.textContent?.includes('Tratamientos previos'))!;
      expect(fila.textContent).not.toContain('Faltante');
      expect(fila.textContent).toContain('Presente y verificado');
      expect(fila.textContent).toContain(d.declarado);
    });
    expect(seccionDeTratamientos().getByText(d.sinTratamiento)).toBeTruthy();
  });

  it('oculta los campos del tratamiento, limpia sus errores y no los envía cuando se marca la casilla [AC-04.1]', async () => {
    bff.aceptarDeclaracion();
    const usuario = userEvent.setup();
    montarCasoParaDeclarar();
    const { dialogo } = await abrirDesdeLaSeccion(usuario);
    await usuario.click(within(dialogo).getByRole('button', { name: registro.guardar }));
    expect(await within(dialogo).findByText(errores.obligatorio)).toBeTruthy();

    await usuario.click(within(dialogo).getByRole('checkbox', { name: d.casilla }));

    expect(within(dialogo).queryByLabelText(t.esquema)).toBeNull();
    expect(within(dialogo).queryByLabelText(t.contexto)).toBeNull();
    expect(within(dialogo).queryByLabelText(t.inicio)).toBeNull();
    expect(within(dialogo).queryByText(errores.obligatorio)).toBeNull();
    expect(within(dialogo).getByLabelText(d.fecha)).toHaveProperty('value', '2026-10-01');
    await usuario.click(within(dialogo).getByRole('button', { name: registro.guardar }));
    await waitFor(() => expect(bff.envios()).toHaveLength(1));
    const cuerpo = bff.envios()[0]?.cuerpo as Record<string, unknown>;
    expect(Object.keys(cuerpo).sort()).toEqual(['attributeKey', 'observedAt', 'value']);
  });

  it('restaura el formulario y su validación cuando se desmarca la casilla [AC-04.1]', async () => {
    const usuario = userEvent.setup();
    montarCasoParaDeclarar();
    const { dialogo } = await abrirDesdeLaSeccion(usuario);
    const casilla = within(dialogo).getByRole('checkbox', { name: d.casilla });
    await usuario.click(casilla);
    await usuario.click(casilla);

    expect(within(dialogo).getByLabelText(t.esquema)).toBeTruthy();
    await usuario.click(within(dialogo).getByRole('button', { name: registro.guardar }));
    expect(await within(dialogo).findByText(errores.obligatorio)).toBeTruthy();
    expect(bff.envios()).toHaveLength(0);
  });

  it('bloquea la fecha posterior a hoy con el error junto al campo y sin enviar [AC-04.1]', async () => {
    const usuario = userEvent.setup();
    montarCasoParaDeclarar();
    const { dialogo } = await abrirDesdeLaSeccion(usuario);
    await usuario.click(within(dialogo).getByRole('checkbox', { name: d.casilla }));

    fireEvent.change(within(dialogo).getByLabelText(d.fecha), { target: { value: '2026-10-02' } });
    await usuario.click(within(dialogo).getByRole('button', { name: registro.guardar }));

    const campo = within(dialogo).getByLabelText(d.fecha);
    expect(await within(dialogo).findByText(errores.fechaFutura)).toBeTruthy();
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(bff.envios()).toHaveLength(0);
  });

  it('muestra el texto del cliente cuando el servidor rechaza declarar con tratamientos vigentes [AC-04.1]', async () => {
    bff.rechazarDeclaracion(422, errorIncoherente);
    const usuario = userEvent.setup();
    montarCasoParaDeclarar();
    const { dialogo } = await abrirDesdeLaSeccion(usuario);
    await usuario.click(within(dialogo).getByRole('checkbox', { name: d.casilla }));
    await usuario.click(within(dialogo).getByRole('button', { name: registro.guardar }));

    expect(await within(dialogo).findByText(d.conTratamientos)).toBeTruthy();
    expect(screen.queryByText(errorIncoherente.message)).toBeNull();
    expect(screen.getByRole('dialog', { name: t.titulo })).toBeTruthy();
  });

  it('no ofrece la casilla cuando el paciente ya tiene tratamientos registrados [AC-04.1]', async () => {
    bff.reiniciar({ caso: casoPCaso, checklist: checklistDeclarado });
    const usuario = userEvent.setup();
    montarCasoParaDeclarar();
    const { dialogo } = await abrirDesdeLaSeccion(usuario);

    expect(within(dialogo).getByLabelText(t.esquema)).toBeTruthy();
    expect(within(dialogo).queryByRole('checkbox', { name: d.casilla })).toBeNull();
  });

  it('avisa del reemplazo y muestra la fecha de la declaración vigente al registrar un tratamiento [AC-04.1]', async () => {
    bff.reiniciar({ caso: casoConDeclaracion, checklist: checklistDeclarado });
    const usuario = userEvent.setup();
    montarCasoParaDeclarar();
    const { dialogo } = await abrirDesdeLaSeccion(usuario);

    expect(within(dialogo).getByText(/Sin tratamiento previo declarado el/)).toBeTruthy();
    expect(within(dialogo).getByText(d.reemplazo)).toBeTruthy();
    expect(within(dialogo).queryByRole('checkbox', { name: d.casilla })).toBeNull();
    expect(within(dialogo).getByLabelText(t.esquema)).toBeTruthy();
  });

  it('distingue «Sin tratamiento previo a la fecha» de «Sin datos» en la tabla de tratamientos [AC-04.1]', async () => {
    bff.reiniciar({ caso: casoConDeclaracion, checklist: checklistDeclarado });
    montarCasoParaDeclarar();
    const tabla = await screen.findByRole('region', { name: secciones.tratamientos });

    expect(within(tabla).getByText(d.sinTratamiento)).toBeTruthy();
    expect(within(tabla).queryByText(sinDatos)).toBeNull();
    expect(screen.getByRole('region', { name: secciones.atributos }).textContent).not.toContain(
      'sin_tratamiento_previo',
    );
  });

  it('mantiene «Sin datos» en la tabla de tratamientos cuando no hay declaración ni tratamientos [AC-04.1]', async () => {
    montarCasoParaDeclarar();
    const tabla = await screen.findByRole('region', { name: secciones.tratamientos });

    expect(within(tabla).getByText(sinDatos)).toBeTruthy();
    expect(within(tabla).queryByText(d.sinTratamiento)).toBeNull();
  });

  it('marca la fila de «Tratamientos previos» como declarada cuando resolvedBy es declaracion_de_ausencia [AC-04.1]', async () => {
    bff.reiniciar({ caso: casoConDeclaracion, checklist: checklistDeclarado });
    montarCasoParaDeclarar();
    const datos = within(await screen.findByRole('region', { name: 'Datos críticos' }));

    await waitFor(() => {
      const fila = datos
        .getAllByRole('listitem')
        .find((li) => li.textContent?.includes('Tratamientos previos'))!;
      expect(fila.textContent).toContain('Presente y verificado');
      expect(fila.textContent).toContain(d.declarado);
    });
  });

  it('es operable con teclado: la casilla anuncia su estado y el foco vuelve al disparador al cerrar [AC-04.1]', async () => {
    const usuario = userEvent.setup();
    montarCasoParaDeclarar();
    const { disparador, dialogo } = await abrirDesdeLaSeccion(usuario);
    const casilla = within(dialogo).getByRole('checkbox', { name: d.casilla }) as HTMLInputElement;

    casilla.focus();
    await usuario.keyboard(' ');
    expect(casilla.checked).toBe(true);
    await usuario.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(disparador);
  });
});
