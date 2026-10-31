import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import conEvidencia from '../../../../../contracts/examples/con-evidencia-s1.json';
import conEvidenciaAplicabilidad from '../../../../../contracts/examples/con-evidencia-s3-aplicabilidad.json';
import conEvidenciaPoblacionNoComparable from '../../../../../contracts/examples/con-evidencia-s3-poblacion-no-comparable.json';
import conEvidenciaPoblacionLista from '../../../../../contracts/examples/con-evidencia-s4-poblacion-lista.json';
import conEvidenciaPoblacionA_M2 from '../../../../../contracts/examples/con-evidencia-s4-poblacion-a-m2.json';
import conEvidenciaPoblacionA_M2B from '../../../../../contracts/examples/con-evidencia-s4-poblacion-a-m2-b.json';
import conEvidenciaTresOpciones from '../../../../../contracts/examples/con-evidencia-s4-tres-opciones.json';
import conEvidenciaTresOpcionesNoComparable from '../../../../../contracts/examples/con-evidencia-s4-tres-opciones-no-comparable.json';
import conEvidenciaSinOpciones from '../../../../../contracts/examples/con-evidencia-sin-opciones.json';
import conEvidenciaSoloDescartadas from '../../../../../contracts/examples/con-evidencia-solo-descartadas.json';
import soloDescartadasCitaInvalida from '../../../../../contracts/examples/con-evidencia-solo-descartadas-cita-invalida.json';
import soloDescartadasMotivosMixtos from '../../../../../contracts/examples/con-evidencia-solo-descartadas-motivos-mixtos.json';
import soloDescartadasOtrosMotivos from '../../../../../contracts/examples/con-evidencia-solo-descartadas-otros-motivos.json';
import checklistF_M1 from '../../../../../contracts/examples/completeness-f-m1.json';
import checklistF_M2 from '../../../../../contracts/examples/completeness-f-m2.json';
import checklistTipoNoHabilitado from '../../../../../contracts/examples/completeness-tipo-no-habilitado.json';
import errorInterno from '../../../../../contracts/examples/error-interno.json';
import errorColaLlena from '../../../../../contracts/examples/error-cola-inferencia-llena.json';
import errorDeadline from '../../../../../contracts/examples/error-deadline-vencido.json';
import errorLlmNoDisponible from '../../../../../contracts/examples/error-llm-local-no-disponible.json';
import errorSalidaLlmInvalida from '../../../../../contracts/examples/error-salida-llm-invalida.json';
import errorServicioIa from '../../../../../contracts/examples/error-servicio-ia.json';
import errorTipoCancer from '../../../../../contracts/examples/error-tipo-cancer-no-registrado.json';
import peticion from '../../../../../contracts/examples/evidence-analysis-request.json';
import sinEvidencia from '../../../../../contracts/examples/sin-evidencia.json';
import tipoNoHabilitado from '../../../../../contracts/examples/tipo-no-habilitado.json';

export {
  checklistF_M1,
  checklistF_M2,
  checklistTipoNoHabilitado,
  errorInterno,
  conEvidencia,
  conEvidenciaAplicabilidad,
  conEvidenciaPoblacionNoComparable,
  conEvidenciaPoblacionLista,
  conEvidenciaPoblacionA_M2,
  conEvidenciaPoblacionA_M2B,
  conEvidenciaSinOpciones,
  conEvidenciaTresOpciones,
  conEvidenciaTresOpcionesNoComparable,
  conEvidenciaSoloDescartadas,
  errorColaLlena,
  errorDeadline,
  errorLlmNoDisponible,
  errorSalidaLlmInvalida,
  errorServicioIa,
  errorTipoCancer,
  peticion,
  sinEvidencia,
  soloDescartadasCitaInvalida,
  soloDescartadasMotivosMixtos,
  soloDescartadasOtrosMotivos,
  tipoNoHabilitado,
};

export interface Respuesta {
  status: number;
  cuerpo: object;
  /** Cabeceras de la respuesta (p. ej. `Retry-After` del `429`, RN-30). */
  cabeceras?: Record<string, string>;
  /** La respuesta espera a esta promesa: así un test fija "petición en curso" sin temporizadores. */
  compuerta?: Promise<void>;
  /** Fallo de red: no hay respuesta HTTP. */
  red?: true;
}

/**
 * `POST /api/evidence-analyses` del BFF simulado en el borde HTTP (MSW) con los ejemplos del contrato
 * (design D1). Las respuestas se sirven en orden y la última se repite: así una secuencia 503 → 200
 * prueba el reintento (`[S1 resp. 31]`). `onUnhandledFrame: 'error'` rechaza cualquier otra ruta.
 */
export function crearBffAnalisisSimulado() {
  const servidor = setupServer();
  const cuerpos: unknown[] = [];
  const lecturasDelChecklist: string[] = [];
  const checklistPorDefecto = () =>
    http.get('*/api/patients/:id/completeness', ({ request }) => {
      lecturasDelChecklist.push(request.url);
      return HttpResponse.json(checklistF_M1);
    });
  return {
    cuerpos,
    /** URLs de cada `GET /api/patients/{id}/completeness` recibido. */
    lecturasDelChecklist,
    iniciar: () => {
      servidor.use(checklistPorDefecto());
      servidor.listen({ onUnhandledFrame: 'error' });
    },
    detener: () => servidor.close(),
    reiniciar: () => {
      servidor.resetHandlers(checklistPorDefecto());
      cuerpos.length = 0;
      lecturasDelChecklist.length = 0;
    },
    /** `GET /api/patients/{id}/completeness` del BFF; sin llamarla responde F-M1 (sin faltantes). */
    responderChecklist: ({ status, cuerpo, red }: { status: number; cuerpo: object; red?: true }) =>
      servidor.use(
        http.get('*/api/patients/:id/completeness', ({ request }) => {
          lecturasDelChecklist.push(request.url);
          return red ? HttpResponse.error() : HttpResponse.json(cuerpo, { status });
        }),
      ),
    responder: (...respuestas: Respuesta[]) => {
      let siguiente = 0;
      servidor.use(
        http.post('*/api/evidence-analyses', async ({ request }) => {
          cuerpos.push(await request.json());
          const { status, cuerpo, cabeceras, compuerta, red } =
            respuestas[Math.min(siguiente++, respuestas.length - 1)]!;
          await compuerta;
          if (red) return HttpResponse.error();
          return HttpResponse.json(cuerpo, { status, headers: cabeceras });
        }),
      );
    },
  };
}
