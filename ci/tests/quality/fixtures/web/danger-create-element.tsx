import { createElement } from 'react';

export function Crudo({ html }: { html: string }) {
  return createElement('div', { dangerouslySetInnerHTML: { __html: html } });
}
