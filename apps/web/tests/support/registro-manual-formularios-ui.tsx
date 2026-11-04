import { render } from '@testing-library/react';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import biomarcadorManual from '../../../../contracts/examples/biomarker-manual.json';
import biomarcadorNoMapeado from '../../../../contracts/examples/biomarker-manual-no-mapeado.json';
import diagnosticoManual from '../../../../contracts/examples/diagnosis-manual-nottingham.json';
import diagnosticoCreado from '../../../../contracts/examples/diagnosis-con-gradings.json';
import errorGradacion from '../../../../contracts/examples/error-gradacion-incoherente-campo.json';
import errorInterno from '../../../../contracts/examples/error-interno.json';
import errorNoAutenticado from '../../../../contracts/examples/error-no-autenticado.json';
import errorPacienteEgresado from '../../../../contracts/examples/error-paciente-egresado.json';
import errorValorFueraDeRango from '../../../../contracts/examples/error-valor-fuera-de-catalogo-campo.json';
import opcionesMama from '../../../../contracts/examples/manual-entry-options-mama.json';
import opcionesProstata from '../../../../contracts/examples/manual-entry-options-prostata.json';
import opcionesSinDiagnostico from '../../../../contracts/examples/manual-entry-options-sin-diagnostico.json';
import fichaAdmin from '../../../../contracts/examples/patient-summary-admin.json';
import fichaDelDoctor from '../../../../contracts/examples/patient-summary-doctor.json';
import type {
  PatientAdminSummary,
  PatientSummary,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { FichaDeAdministrador } from '../../components/organisms/ficha-de-administrador';
import { FichaDelDoctor } from '../../components/organisms/ficha-del-doctor';
import { VistaDeCaso } from '../../components/organisms/vista-de-caso';
import { casoVacio, HOY, ID_DEL_CASO } from './caso-ui';

/** 201 de `createManualBiomarker` para Ki-67: el cuerpo del ejemplo de la operación, completado como lo respondería el servidor. */
const biomarcadorCreado = {
  ...biomarcadorNoMapeado,
  ...biomarcadorManual,
  loincCode: '85330-9',
  mappingStatus: 'mapeado',
  clinicalSignificance: 'relevante',
};

export {
  biomarcadorCreado,
  diagnosticoManual,
  biomarcadorNoMapeado,
  diagnosticoCreado,
  errorGradacion,
  errorInterno,
  errorNoAutenticado,
  errorPacienteEgresado,
  errorValorFueraDeRango,
  fichaAdmin,
  fichaDelDoctor,
  opcionesMama,
  opcionesProstata,
  opcionesSinDiagnostico,
};

export { HOY, ID_DEL_CASO };

/** Los `PATCH`/`POST` del BFF llegan al navegador por `/api/*`; el router de Next es el único borde de framework simulado. */
export interface PeticionAlBff {
  metodo: string;
  ruta: string;
  cuerpo: unknown;
}

type Caso = typeof casoVacio;

const SERIE_DE_KI67 = {
  name: 'Ki-67',
  loincCode: '85330-9',
  points: [
    {
      value: '20',
      unit: '%',
      performedAt: '2026-09-10',
      provenance: {
        entryMethod: 'manual',
        extractionConfidence: 'n_a',
        reviewStatus: 'verificado',
        conflict: false,
        sourceDocumentId: null,
        additionalSourceDocumentIds: [],
      },
    },
  ],
};

/** BFF simulado en el borde HTTP (MSW): `GET /case` refleja lo que dejan los `201`; el resto responde lo que el test fija. */
export function crearBffDeFormulariosSimulado() {
  const servidor = setupServer();
  const peticiones: PeticionAlBff[] = [];
  let caso: Caso = casoVacio;
  const registrar = async (request: Request): Promise<void> => {
    const texto = await request.text();
    peticiones.push({
      metodo: request.method,
      ruta: new URL(request.url).pathname,
      cuerpo: texto === '' ? null : (JSON.parse(texto) as unknown),
    });
  };
  const responder = (metodo: 'get' | 'post', ruta: string, status: number, cuerpo: JsonBodyType) =>
    servidor.use(
      http[metodo](`*/api/patients/:id/${ruta}`, async ({ request }) => {
        await registrar(request);
        return HttpResponse.json(cuerpo, { status });
      }),
    );
  const predeterminados = () =>
    servidor.use(
      http.get('*/api/patients/:id/case', async ({ request }) => {
        await registrar(request);
        return HttpResponse.json(caso);
      }),
    );
  predeterminados();
  return {
    peticiones,
    iniciar: () => servidor.listen({ onUnhandledFrame: 'error' }),
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers();
      peticiones.length = 0;
      caso = casoVacio;
      predeterminados();
    },
    opciones: (cuerpo: JsonBodyType = opcionesMama, status = 200) =>
      responder('get', 'manual-entry-options', status, cuerpo),
    crearBiomarcador: (cuerpo: JsonBodyType, status = 201) => {
      servidor.use(
        http.post('*/api/patients/:id/biomarkers', async ({ request }) => {
          await registrar(request);
          if (status === 201) caso = { ...casoVacio, biomarkerSeries: [SERIE_DE_KI67] } as Caso;
          return HttpResponse.json(cuerpo, { status });
        }),
      );
    },
    crearDiagnostico: (cuerpo: JsonBodyType, status = 201) =>
      responder('post', 'diagnoses', status, cuerpo),
  };
}

export const montarCasoConFormularios = (item?: string) =>
  render(<VistaDeCaso patientId={ID_DEL_CASO} hoy={HOY} item={item} />);

/** Los ejemplos del contrato son JSON sin literales de unión: se afirma el tipo del contrato al montar. */
export const montarFichaConFormularios = (ficha: object = fichaDelDoctor, item?: string) =>
  render(<FichaDelDoctor ficha={ficha as PatientSummary} notas={[]} hoy={HOY} item={item} />);

export const montarFichaDeAdministrador = () =>
  render(<FichaDeAdministrador ficha={fichaAdmin as PatientAdminSummary} />);

/** Ficha del doctor sin diagnóstico vigente (paciente sin `Diagnosis` activo). */
export const fichaSinDiagnostico = { ...fichaDelDoctor, diagnosis: null };

/** Ficha del doctor con paciente egresado: los botones quedan deshabilitados por regla legal (RN-17). */
export const fichaEgresada = { ...fichaDelDoctor, lifecycleStatus: 'egresado' as const };

/** Ficha del doctor de próstata: diagnóstico vigente con gradación Gleason e ISUP. */
export const fichaDeProstata = { ...fichaDelDoctor, diagnosis: diagnosticoCreado };
