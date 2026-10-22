// Reglas de capas de Node (L1D-263, US-213 AC-2). `npm run quality` las ejecuta sobre apps/ y packages/.
// Cada violación nombra la regla y el archivo; las excepciones con caducidad viven en quality-thresholds.json.
// Misma regla de caducidad que ESLint y el reporte: un solo módulo (scripts/quality/umbrales.mjs).
const { excepcionesVigentes, leerUmbrales } = require('./scripts/quality/umbrales.mjs');

const excepciones = excepcionesVigentes(leerUmbrales().excepciones, new Date());

const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Archivos exceptuados de una regla de capas hasta su fecha (D5).
const exceptuados = (regla) =>
  excepciones.filter((e) => e.regla === regla).map((e) => `^${escaparRegex(e.archivo)}$`);

const DATOS_CLINICAL_API = '(^|/)@prisma/|\\.repository\\.ts$|/infrastructure/database\\.ts$';

module.exports = {
  forbidden: [
    {
      name: 'controller-sin-acceso-a-datos',
      comment:
        'Un controller solo traduce HTTP ↔ service: no importa Prisma ni un repository (readme §2.1).',
      severity: 'error',
      from: {
        path: '^apps/clinical-api/src/modules/.+\\.controller\\.ts$',
        pathNot: exceptuados('controller-sin-acceso-a-datos'),
      },
      to: { path: DATOS_CLINICAL_API },
    },
    {
      name: 'web-solo-por-bff',
      comment:
        'web habla con clinical-api solo por HTTP desde los Route Handlers: nunca importa su código (readme §2.3).',
      severity: 'error',
      from: { path: '^apps/web/', pathNot: exceptuados('web-solo-por-bff') },
      to: { path: '^apps/(clinical-api|rag-orchestrator)/' },
    },
    {
      name: 'componentes-sin-datos',
      comment:
        'Los componentes de web no acceden a datos: ni Prisma ni clientes HTTP directos; los datos llegan por props o por lib/.',
      severity: 'error',
      from: { path: '^apps/web/components/', pathNot: exceptuados('componentes-sin-datos') },
      to: {
        path: '(^|/)@prisma/|(node_modules/|\\.\\./)(axios|undici|node-fetch|ky|got|pg)/|^apps/web/lib/server/|^packages/api-contracts/src/client/',
      },
    },
    {
      name: 'sin-ciclos',
      comment:
        'Las dependencias circulares ocultan el acoplamiento entre módulos. Lo generado (packages/api-contracts/src) no se mide: no se edita a mano.',
      severity: 'error',
      from: { pathNot: ['^packages/api-contracts/src/'].concat(exceptuados('sin-ciclos')) },
      to: { circular: true },
    },
    {
      name: 'api-contracts-generado',
      comment:
        'packages/api-contracts/src es generado desde los openapi.yaml: se consume solo por sus carpetas de salida (client, client-web, types, zod), nunca por un archivo interno del generador.',
      severity: 'error',
      from: {
        path: '^(apps|packages)/',
        pathNot: ['^packages/api-contracts/'].concat(exceptuados('api-contracts-generado')),
      },
      to: {
        path: '^packages/api-contracts/src/',
        pathNot: '^packages/api-contracts/src/(client|client-web|types|zod)/',
      },
    },
    {
      name: 'web-sin-contrato-rag',
      comment:
        'El contrato de rag-orchestrator es solo de clinical-api: web no lo importa (la sesión del doctor no llega a Backend 2).',
      severity: 'error',
      from: { path: '^apps/web/', pathNot: exceptuados('web-sin-contrato-rag') },
      to: { path: '^packages/api-contracts/src/[^/]+/rag-orchestrator/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|dist|\\.next|coverage)/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    skipAnalysisNotInRules: true,
  },
};
