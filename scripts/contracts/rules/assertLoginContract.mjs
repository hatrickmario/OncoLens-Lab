/** AC-1 [Pre-S1 resp. 29]: el login responde 204 sin cuerpo con la cookie documentada y 401 genérico con traceId. */
import { errorCodes } from '../lib/errors.mjs';
import { reporter } from '../lib/findings.mjs';
import { findOperation, findResponse, jsonSchemaOf } from '../lib/operations.mjs';
import { missingFragments } from '../lib/text.mjs';
import { CLINICAL_API } from '../lib/specs.mjs';

const report = reporter('assertLoginContract', 'AC-1');

const COOKIE_ATTRIBUTES = ['HttpOnly', 'Secure', 'SameSite=Strict'];
const LOGIN_ERROR_EXAMPLE = 'error-credenciales-invalidas.json';

function checkCookie(file, pointer, noContent) {
  const found = [];
  if (noContent.node?.content) found.push(report(file, `${noContent.pointer}/content`, 'el 204 del login no lleva cuerpo'));
  const cookie = noContent.node?.headers?.['Set-Cookie'];
  const missing = missingFragments(cookie?.description, COOKIE_ATTRIBUTES);
  if (missing.length > 0) {
    found.push(report(file, `${pointer}/headers/Set-Cookie`, `la cabecera Set-Cookie debe documentar ${missing.join(', ')}`));
  }
  return found;
}

export function assertLoginContract(specs, examples) {
  const { file, bundled } = specs[CLINICAL_API];
  const login = findOperation(bundled, 'post', '/platform/auth/login');
  if (!login) return [];
  const found = [];
  const noContent = findResponse(bundled, login, 204);
  if (!noContent) {
    found.push(report(file, `${login.pointer}/responses`, 'el login debe responder 204'));
  } else {
    found.push(...checkCookie(file, noContent.pointer, noContent));
  }
  const unauthorized = findResponse(bundled, login, 401);
  const schema = unauthorized && jsonSchemaOf(bundled, unauthorized);
  if (!schema || !errorCodes(bundled, schema.node)?.includes('CREDENCIALES_INVALIDAS')) {
    found.push(report(file, `${login.pointer}/responses/401`, 'el 401 del login debe tener error const CREDENCIALES_INVALIDAS'));
  }
  const hasExample = (examples.index?.examples ?? []).some((entry) => entry.file === LOGIN_ERROR_EXAMPLE);
  if (!hasExample) found.push(report(file, `${login.pointer}/responses/401`, `falta el ejemplo ${LOGIN_ERROR_EXAMPLE} en index.json`));
  return found;
}
