'use client';

import { setNonce } from 'get-nonce';
import { useEffect } from 'react';

/**
 * Los diálogos de Radix inyectan un `<style>` (react-style-singleton) que la CSP solo admite con nonce (US-216).
 * Lee el nonce de la request, publicado por el layout, antes de que el usuario abra cualquier diálogo.
 */
export function NonceDeEstilos() {
  useEffect(() => {
    const nonce = document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content');
    if (nonce) setNonce(nonce);
  }, []);
  return null;
}
