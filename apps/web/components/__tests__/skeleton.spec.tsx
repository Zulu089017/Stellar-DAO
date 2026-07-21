import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '@stellardao/ui';

describe('Skeleton', () => {
  it('renders with shimmer-stripe class', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild;
    expect(el).toBeInTheDocument();
    expect(el?.className).toContain('shimmer-stripe');
  });

  it('accepts custom className', () => {
    const { container } = render(<Skeleton className="h-10 w-20" />);
    const el = container.firstElementChild;
    expect(el?.className).toContain('h-10');
    expect(el?.className).toContain('w-20');
  });

  it('renders as a div element with aria-hidden', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe('DIV');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });
});
