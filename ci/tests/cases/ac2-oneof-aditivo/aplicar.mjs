// La respuesta LlmLocalNoDisponible pasa a oneOf [variante original, variante con un código nuevo].
import { readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';

const archivo = 'apps/rag-orchestrator/openapi.yaml';
const documento = YAML.parse(readFileSync(archivo, 'utf8'));
const { schemas, responses } = documento.components;
schemas.ErrorProveedorNoDisponible = {
  type: 'object',
  additionalProperties: false,
  required: ['error', 'message', 'traceId'],
  properties: { error: { type: 'string', const: 'PROVEEDOR_NO_DISPONIBLE' }, message: { type: 'string' }, traceId: { type: 'string' } },
};
responses.LlmLocalNoDisponible.content['application/json'].schema = {
  oneOf: [{ $ref: '#/components/schemas/ErrorLlmLocalNoDisponible' }, { $ref: '#/components/schemas/ErrorProveedorNoDisponible' }],
};
writeFileSync(archivo, YAML.stringify(documento, { lineWidth: 0 }));
