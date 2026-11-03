import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montarCaso } from '../../support/caso-http.js';
import { prepararSiembra } from '../../support/completitud.js';
import { montarCompletitud, servicioDeCompletitud } from '../../support/completitud-http.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  CLAVE_DEL_DATO_SIN_VERIFICAR,
  CLAVE_DEL_FALTANTE,
  sembrarFxT3a,
  type FxT3aSembrado,
} from '../../support/fx-t3-a.js';
import { abrirSesion, prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';
import { servicioDeIdentidad } from '../../support/identidad.js';
import { montarPacientes } from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9720;

let mundo: MundoDeGateway;
let cookie: string;
let fxT3a: FxT3aSembrado;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('lecturas_con_avisos', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-lecturas-avisos-0001');
  const siembra = await prepararSiembra(mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
  fxT3a = await sembrarFxT3a(siembra);
  // La ficha exige identidad (como todo paciente del seed): sintética y cifrada con el servicio real (RN-10, RN-13).
  await servicioDeIdentidad(mundo.cliente).guardar({
    patientId: fxT3a.patientId,
    idType: 'sintetico',
    issuingCountry: null,
    numeroDeDocumento: 'SINT-0000099',
    nombreCompleto: 'Prueba Sintética FX-T3-a',
  });
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
      .get(`/platform/patients/${fxT3a.patientId}`)
      .set('Cookie', cookie);
    const caso = await clienteVerificado(appCaso)
      .get(`/platform/patients/${fxT3a.patientId}/case`)
      .set('Cookie', cookie);
    const checklist = await clienteVerificado(appChecklist)
      .get(`/platform/patients/${fxT3a.patientId}/completeness`)
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
