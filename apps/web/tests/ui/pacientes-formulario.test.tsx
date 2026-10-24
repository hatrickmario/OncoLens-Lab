// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormularioDeBusqueda } from '../../components/molecules/formulario-de-busqueda';
import { mensajes } from '../../lib/mensajes';

const { pacientes } = mensajes();

function montar() {
  render(<FormularioDeBusqueda textos={pacientes} buscando={false} onBuscar={vi.fn()} />);
  return userEvent.setup();
}

const tab = (nombre: string) => screen.getByRole('tab', { name: nombre });

describe('FormularioDeBusqueda: envío nativo', () => {
  it('declara method=post hacia /api/patients/search en el HTML del servidor para no poner la identidad en la URL si se envía antes de hidratar [US-048 AC-5]', () => {
    const html = renderToString(
      <FormularioDeBusqueda textos={pacientes} buscando={false} onBuscar={vi.fn()} />,
    );

    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/patients/search"');
    expect(html).not.toMatch(/<form[^>]*method="get"/i);
  });
});

describe('FormularioDeBusqueda: antes de hidratar', () => {
  afterEach(cleanup);

  it('sirve el botón deshabilitado con "Cargando la búsqueda…" para que ningún envío temprano muestre JSON crudo [ARR-09 AC-3]', () => {
    const html = renderToString(
      <FormularioDeBusqueda textos={pacientes} buscando={false} onBuscar={vi.fn()} />,
    );

    expect(html).toMatch(/<button[^>]*disabled[^>]*>Cargando la búsqueda…<\/button>/);
  });

  it('habilita el botón "Buscar" una vez montado en el navegador', () => {
    montar();

    const boton = screen.getByRole('button', { name: pacientes.busqueda.buscar });
    expect((boton as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('PestanasDeBusqueda: teclado', () => {
  afterEach(cleanup);

  it('mueve la selección y el foco a Por nombre con ArrowRight y envuelve con ArrowLeft [US-048 AC-3]', async () => {
    const usuario = montar();
    tab(pacientes.busqueda.porDocumento).focus();

    await usuario.keyboard('{ArrowRight}');
    expect(tab(pacientes.busqueda.porNombre).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(pacientes.busqueda.porNombre));

    await usuario.keyboard('{ArrowRight}');
    expect(tab(pacientes.busqueda.porDocumento).getAttribute('aria-selected')).toBe('true');

    await usuario.keyboard('{ArrowLeft}');
    expect(tab(pacientes.busqueda.porNombre).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(pacientes.busqueda.porNombre));
  });

  it('va a la primera con Home y a la última con End', async () => {
    const usuario = montar();
    tab(pacientes.busqueda.porDocumento).focus();

    await usuario.keyboard('{End}');
    expect(tab(pacientes.busqueda.porNombre).getAttribute('aria-selected')).toBe('true');

    await usuario.keyboard('{Home}');
    expect(tab(pacientes.busqueda.porDocumento).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab(pacientes.busqueda.porDocumento));
  });

  it('deja aria-selected=true y tabindex=0 solo en la pestaña vigente', async () => {
    const usuario = montar();
    tab(pacientes.busqueda.porDocumento).focus();
    await usuario.keyboard('{ArrowRight}');

    expect(tab(pacientes.busqueda.porNombre).getAttribute('tabindex')).toBe('0');
    expect(tab(pacientes.busqueda.porDocumento).getAttribute('tabindex')).toBe('-1');
    expect(tab(pacientes.busqueda.porDocumento).getAttribute('aria-selected')).toBe('false');
  });

  it('no secuestra Alt+ArrowLeft cuando hay un modificador', async () => {
    const usuario = montar();
    tab(pacientes.busqueda.porDocumento).focus();

    await usuario.keyboard('{Alt>}{ArrowLeft}{/Alt}');

    expect(tab(pacientes.busqueda.porDocumento).getAttribute('aria-selected')).toBe('true');
  });
});
