import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LogoMark } from './logo-mark';

describe('LogoMark', () => {
  it('renders with default size 28px', () => {
    const { container } = render(<LogoMark />);
    const span = container.firstElementChild as HTMLElement;
    expect(span.style.width).toBe('28px');
    expect(span.style.height).toBe('28px');
  });

  it('renders with custom size', () => {
    const { container } = render(<LogoMark size={48} />);
    const span = container.firstElementChild as HTMLElement;
    expect(span.style.width).toBe('48px');
    expect(span.style.height).toBe('48px');
  });
});
