import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@stellardao/ui';

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('renders as a button element', () => {
    render(<Button>Submit</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('applies disabled state', () => {
    render(<Button disabled>Disabled</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
  });

  it('renders with custom className', () => {
    render(<Button className="custom-class">Styled</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('custom-class');
  });
});
