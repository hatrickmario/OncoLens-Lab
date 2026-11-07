import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { esUrlHttpSegura } from '../../lib/evidence/procedencia';

/** `urlTransform` de `react-markdown`: solo pasan las URL que `esUrlHttpSegura()` acepta (L1D-266); el resto queda en ''. */
function soloUrlSegura(url: string): string {
  return esUrlHttpSegura(url) ? url : '';
}

/** Un enlace sin URL segura se pinta como texto: nunca un `href` vacío ni `javascript:`. */
function Enlace({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return <span>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/**
 * Texto de un bloque (del LLM o del corpus) como Markdown, sin HTML crudo: sin `rehype-raw`, con `rehype-sanitize` y
 * enlaces validados. Nunca `dangerouslySetInnerHTML` (OWASP, XSS).
 */
export function MarkdownSeguro({ texto }: { texto: string }) {
  return (
    <Markdown
      rehypePlugins={[rehypeSanitize]}
      disallowedElements={['img']}
      unwrapDisallowed
      urlTransform={soloUrlSegura}
      components={{ a: Enlace }}
    >
      {texto}
    </Markdown>
  );
}
