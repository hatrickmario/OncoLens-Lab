// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Card } from '../../components/ui/card';

describe('Card', () => {
  afterEach(cleanup);

  it('usa solo el radio de diálogo de 10 px y la sombra cuando es elevada [ARR-02 AC-3]', () => {
    render(<Card variante="elevada">contenido</Card>);

    const clases = screen.getByText('contenido').className.split(' ');
    expect(clases).toContain('rounded-dialogo');
    expect(clases).toContain('shadow-dialogo');
    expect(clases).not.toContain('rounded-tarjeta');
  });

  it('usa el radio de tarjeta de 8 px y ninguna sombra cuando no es elevada', () => {
    render(<Card>contenido</Card>);

    const clases = screen.getByText('contenido').className.split(' ');
    expect(clases).toContain('rounded-tarjeta');
    expect(clases).not.toContain('shadow-dialogo');
  });
});
