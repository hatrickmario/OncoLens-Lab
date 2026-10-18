// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import conEvidencia from '../../../../contracts/examples/con-evidencia-s1.json';
import sinEvidencia from '../../../../contracts/examples/sin-evidencia.json';
import DashboardLayout from '../../app/(dashboard)/layout';
import { AiDisclaimer } from '../../components/molecules/ai-disclaimer';
import { AppHeader } from '../../components/organisms/app-header';
import { mensajes } from '../../lib/mensajes';

const ETIQUETA = mensajes().app.academicUseLabel;
const DISCLAIMER_SINTETICO = 'Aviso sintético de prueba, distinto del valor por defecto.';

describe('AiDisclaimer', () => {
  afterEach(cleanup);

  it('muestra el disclaimer recibido en una región note cuando el análisis es con_evidencia [US-069 AC-1]', () => {
    render(<AiDisclaimer text={conEvidencia.disclaimer} />);

    const aviso = screen.getByRole('note');
    expect(aviso.textContent).toBe(conEvidencia.disclaimer);
    expect(aviso.textContent).toContain('requiere validación clínica independiente');
  });

  it('muestra el aviso cuando el análisis es sin_evidencia [US-069 AC-4]', () => {
    render(<AiDisclaimer text={sinEvidencia.disclaimer} />);

    expect(screen.getByRole('note').textContent).toBe(sinEvidencia.disclaimer);
  });

  it('muestra un valor sintético de disclaimer tal cual llega, sin texto propio [US-069 AC-2]', () => {
    render(<AiDisclaimer text={DISCLAIMER_SINTETICO} />);

    expect(screen.getByRole('note').textContent).toBe(DISCLAIMER_SINTETICO);
  });
});

describe('AppHeader y layout del dashboard', () => {
  afterEach(cleanup);

  it('muestra Uso académico/investigación en la cabecera del layout fuera de la región note [US-069 AC-3]', () => {
    render(
      <DashboardLayout>
        <AiDisclaimer text={conEvidencia.disclaimer} />
      </DashboardLayout>,
    );

    const cabecera = screen.getByRole('banner');
    expect(within(cabecera).getByText(ETIQUETA)).toBeTruthy();
    expect(within(screen.getByRole('note')).queryByText(ETIQUETA)).toBeNull();
    expect(screen.getByRole('note').textContent).not.toContain(ETIQUETA);
  });

  it('muestra la marca y la etiqueta de la clave app.academicUseLabel cuando se monta solo la cabecera', () => {
    render(<AppHeader />);

    expect(screen.getByText(mensajes().app.nombre)).toBeTruthy();
    expect(screen.getByText(ETIQUETA)).toBeTruthy();
  });
});
