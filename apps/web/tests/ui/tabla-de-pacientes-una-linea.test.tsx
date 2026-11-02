// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PatientListItem } from '../../../../packages/api-contracts/src/types/clinical-api';
import { TablaDePacientes } from '../../components/organisms/tabla-de-pacientes';
import { mensajes, rellenar } from '../../lib/mensajes';
import { otroPaciente, pacienteDelEjemplo } from '../support/pacientes-ui';

const { pacientes } = mensajes();
const FILAS = [pacienteDelEjemplo, otroPaciente] as PatientListItem[];

describe('TablaDePacientes · columna Paciente (feedback de la Demo 4, F2)', () => {
  afterEach(cleanup);

  it.each(FILAS)(
    'muestra el nombre y la máscara del ID en una sola línea cuando la vista es la del médico ($fullNameMasked)',
    (paciente) => {
      render(<TablaDePacientes items={[paciente]} textos={pacientes} />);

      const nombre = screen.getByText(paciente.fullNameMasked);
      const id = screen.getByText(paciente.nationalIdMasked);
      const linea = nombre.parentElement;

      expect(linea).toBe(id.parentElement);
      expect(linea?.className).not.toContain('flex-col');
      expect(linea?.className).toContain('whitespace-nowrap');
      expect(linea?.children).toHaveLength(2);
    },
  );

  it.each(FILAS)(
    'deja el año de nacimiento en su propia línea, fuera de la línea del nombre y el ID ($birthYear)',
    (paciente) => {
      render(<TablaDePacientes items={[paciente]} textos={pacientes} />);

      const linea = screen.getByText(paciente.fullNameMasked).parentElement;
      const anio = screen.getByText(
        rellenar(pacientes.tabla.anioNacimiento, { anio: paciente.birthYear }),
      );

      expect(linea?.contains(anio)).toBe(false);
      expect(anio.parentElement).toBe(linea?.parentElement);
    },
  );
});
