import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  nuevoPaciente,
  sembrarAtributo,
  type PacienteSembrado,
} from '../../support/completitud.js';
import {
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import { mamaSinRegistros } from '../../support/correcciones-tratamiento-atributo.js';
import { montarRegistroClinico } from '../../support/registro-clinico.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9996;
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeCorrecciones('corr_catalogo_alta', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

interface Esperado {
  readonly error: string;
  readonly field?: string;
}

interface Caso {
  readonly nombre: string;
  readonly paciente: () => Promise<PacienteSembrado>;
  /** Atributo sembrado que la corrección intenta cambiar al valor `corregidoA`. */
  readonly sembrado: { key: string; value: string };
  readonly alta: { attributeKey: string; value: string };
  readonly corregidoA: string;
  /** Comportamiento ACTUAL de cada vía (el contrato las distingue; unificarlo sería un cambio de contrato). */
  readonly esperadoEnAlta: Esperado;
  readonly esperadoEnCorreccion: Esperado;
}

const CASOS: readonly Caso[] = [
  {
    nombre: 'valor fuera de la lista del catálogo',
    paciente: () => mamaSinRegistros(escenario),
    sembrado: { key: 'estado_menopausico', value: 'posmenopausica' },
    alta: { attributeKey: 'estado_menopausico', value: 'valor-inventado' },
    corregidoA: 'valor-inventado',
    esperadoEnAlta: { error: 'VALOR_FUERA_DE_CATALOGO', field: 'value' },
    esperadoEnCorreccion: { error: 'VALOR_FUERA_DE_CATALOGO', field: 'value' },
  },
  {
    nombre: 'clave ausente del catálogo del tipo de cáncer',
    paciente: () => mamaSinRegistros(escenario),
    sembrado: { key: 'estado_castracion', value: 'castrado' },
    alta: { attributeKey: 'estado_castracion', value: 'castrado' },
    corregidoA: 'no_castrado',
    // Diferencia documentada: el alta señala la clave; la corrección no la admite en el cuerpo y señala el valor.
    esperadoEnAlta: { error: 'VALOR_FUERA_DE_CATALOGO', field: 'attributeKey' },
    esperadoEnCorreccion: { error: 'VALOR_FUERA_DE_CATALOGO', field: 'value' },
  },
  {
    nombre: 'paciente sin diagnóstico vigente',
    paciente: () => nuevoPaciente(escenario.siembra),
    sembrado: { key: 'estado_menopausico', value: 'posmenopausica' },
    alta: { attributeKey: 'estado_menopausico', value: 'premenopausica' },
    corregidoA: 'premenopausica',
    // Diferencia documentada (deuda): el alta tiene un código propio; la corrección trata el catálogo como vacío.
    esperadoEnAlta: { error: 'TIPO_CANCER_NO_REGISTRADO' },
    esperadoEnCorreccion: { error: 'VALOR_FUERA_DE_CATALOGO', field: 'value' },
  },
];

async function idDelAtributo(paciente: PacienteSembrado, key: string): Promise<string> {
  const { rows } = await paciente.cliente.query<{ id: string }>(
    'SELECT id FROM clinical.clinical_attribute WHERE patient_id = $1 AND attribute_key = $2',
    [paciente.patientId, key],
  );
  return rows[0]!.id;
}

describe.each(CASOS)('catálogo de atributos (RN-29): $nombre', (caso) => {
  it('rechaza el alta con el error y el campo vigentes [d5fb-05 AC-5]', async () => {
    const paciente = await caso.paciente();

    const { app } = montarRegistroClinico(escenario.mundo);
    const respuesta = await clienteVerificado(app)
      .post(`/platform/patients/${paciente.patientId}/clinical-attributes`)
      .set('Cookie', escenario.cookieDoctor)
      .send(caso.alta);

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe(caso.esperadoEnAlta.error);
    expect(respuesta.body.field).toBe(caso.esperadoEnAlta.field);
  });

  it('rechaza la corrección con el error y el campo vigentes [d5fb-05 AC-5]', async () => {
    const paciente = await caso.paciente();
    await sembrarAtributo(paciente, { ...caso.sembrado, reviewStatus: 'verificado' });
    const id = await idDelAtributo(paciente, caso.sembrado.key);

    const respuesta = await clienteVerificado(montarCorrecciones(escenario.mundo).app)
      .post(`/platform/patients/${paciente.patientId}/clinical-attributes/${id}/corrections`)
      .set('Cookie', escenario.cookieDoctor)
      .send({ value: caso.corregidoA });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe(caso.esperadoEnCorreccion.error);
    expect(respuesta.body.field).toBe(caso.esperadoEnCorreccion.field);
  });
});
