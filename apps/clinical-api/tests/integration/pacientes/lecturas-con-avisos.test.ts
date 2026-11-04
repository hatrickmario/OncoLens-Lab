import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montarCaso } from '../../support/caso-http.js';
import { montarCompletitud, servicioDeCompletitud } from '../../support/completitud-http.js';
import {
  abrirSesion,
  idDePaciente,
  prepararMundoConSeed,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { montarPacientes } from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9720;
/** FX-T3-a es el paciente semilla (f): la misma fila que recorre el E2E. */
const PACIENTE_FX_T3_A = idDePaciente('f');
const CLAVE_DEL_DATO_SIN_VERIFICAR = 'ki67';
const CLAVE_DEL_FALTANTE = 'estado_menopausico';

let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('lecturas_con_avisos', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-lecturas-avisos-0001');
});
afterAll(() => mundo.cerrar());

interface DatoConProcedencia {
  name: string;
  provenance: { reviewStatus: string };
}
interface ItemDelChecklist {
  item: string;
  status: string;
}

describe('lecturas del paciente · FX-T3-a acumula todos los avisos clínicos (RN-26)', () => {
  it('la ficha, la vista de caso y el checklist responden 200 con sus avisos cuando el paciente es FX-T3-a [US-071 AC-4]', async () => {
    const { app: appFicha } = montarPacientes(mundo, { completitud: servicioDeCompletitud(mundo) });
    const { app: appCaso } = montarCaso(mundo);
    const { app: appChecklist } = montarCompletitud(mundo);

    const ficha = await clienteVerificado(appFicha)
      .get(`/platform/patients/${PACIENTE_FX_T3_A}`)
      .set('Cookie', cookie);
    const caso = await clienteVerificado(appCaso)
      .get(`/platform/patients/${PACIENTE_FX_T3_A}/case`)
      .set('Cookie', cookie);
    const checklist = await clienteVerificado(appChecklist)
      .get(`/platform/patients/${PACIENTE_FX_T3_A}/completeness`)
      .set('Cookie', cookie);

    expect([ficha.status, caso.status, checklist.status]).toEqual([200, 200, 200]);
    const kiEnFicha = (ficha.body.recentBiomarkers as DatoConProcedencia[]).find(
      (b) => b.name === 'Ki-67',
    );
    expect(kiEnFicha?.provenance.reviewStatus).toBe('requiere_revision');
    const serieKi = (
      caso.body.biomarkerSeries as { name: string; points: DatoConProcedencia['provenance'][] }[]
    ).find((s) => s.name === 'Ki-67');
    expect(serieKi?.points[0]).toMatchObject({
      provenance: { reviewStatus: 'requiere_revision' },
    });
    const estados = new Map(
      (checklist.body.items as ItemDelChecklist[]).map((i) => [i.item, i.status]),
    );
    expect(estados.get(CLAVE_DEL_DATO_SIN_VERIFICAR)).toBe('presente_sin_verificar');
    expect(estados.get(CLAVE_DEL_FALTANTE)).toBe('faltante');
  });
});
