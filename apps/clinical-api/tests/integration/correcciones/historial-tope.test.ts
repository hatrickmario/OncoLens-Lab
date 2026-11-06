import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  pacienteConNotas,
  registrarKi67,
  sembrarNotasDeFx253a,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import {
  TRATAMIENTO_AC_T,
  mamaSinRegistros,
  registrarAtributo,
  registrarTratamiento,
} from '../../support/correcciones-tratamiento-atributo.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9997;
const TOPE = 2;
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeCorrecciones('corr_historial_tope', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

interface Tabla {
  readonly nombre: string;
  readonly ruta: string;
  /** Registra el dato de partida y devuelve el paciente y su id. */
  readonly iniciar: () => Promise<{ patientId: string; id: string }>;
  /** Cuerpo de la corrección número `n` (cada una cambia algo real). */
  readonly cuerpo: (n: number) => object;
}

const TABLAS: readonly Tabla[] = [
  {
    nombre: 'biomarcador',
    ruta: 'biomarkers',
    iniciar: async () => {
      const { patientId } = await pacienteConNotas(escenario);
      return { patientId, id: await registrarKi67(escenario, patientId) };
    },
    cuerpo: (n) => ({ value: String(25 + n), unit: '%' }),
  },
  {
    nombre: 'nota clínica',
    ruta: 'clinical-notes',
    iniciar: async () => {
      const paciente = await pacienteConNotas(escenario);
      const { notaLibreId } = await sembrarNotasDeFx253a(paciente);
      return { patientId: paciente.patientId, id: notaLibreId };
    },
    cuerpo: (n) => ({ content: `Texto corregido número ${n}.` }),
  },
  {
    nombre: 'tratamiento previo',
    ruta: 'prior-treatments',
    iniciar: async () => {
      const { patientId } = await mamaSinRegistros(escenario);
      return { patientId, id: await registrarTratamiento(escenario, patientId) };
    },
    cuerpo: (n) => ({ ...TRATAMIENTO_AC_T, regimenName: `Esquema ${n}` }),
  },
  {
    nombre: 'atributo clínico',
    ruta: 'clinical-attributes',
    iniciar: async () => {
      const { patientId } = await mamaSinRegistros(escenario);
      return { patientId, id: await registrarAtributo(escenario, patientId) };
    },
    cuerpo: (n) => ({ value: ['premenopausica', 'perimenopausica', 'posmenopausica'][n % 3]! }),
  },
];

describe.each(TABLAS)('tope CORRECTION_HISTORY_MAX del histórico de $nombre', (tabla) => {
  it('devuelve como máximo el tope de versiones reemplazadas más recientes cuando la cadena es más larga [d5fb-05 AC-1] [RN-22]', async () => {
    const { app } = montarCorrecciones(escenario.mundo, { limites: { historialMax: TOPE } });
    const { patientId, id } = await tabla.iniciar();
    let vigente = id;
    for (const n of [1, 2, 3]) {
      const respuesta = await clienteVerificado(app)
        .post(`/platform/patients/${patientId}/${tabla.ruta}/${vigente}/corrections`)
        .set('Cookie', escenario.cookieDoctor)
        .send(tabla.cuerpo(n));
      expect(respuesta.status).toBe(201);
      vigente = respuesta.body.id as string;
    }

    const historial = await clienteVerificado(app)
      .get(`/platform/patients/${patientId}/${tabla.ruta}/${vigente}/history`)
      .set('Cookie', escenario.cookieDoctor);

    expect(historial.status).toBe(200);
    expect(historial.body.items).toHaveLength(TOPE);
    expect((historial.body.items as { id: string }[]).map((v) => v.id)).not.toContain(id);
  });
});
