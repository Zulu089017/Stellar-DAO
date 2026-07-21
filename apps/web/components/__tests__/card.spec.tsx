import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '@stellardao/ui';

describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <p>Card content</p>
      </Card>,
    );
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('renders with custom className', () => {
    const { container } = render(<Card className="p-6">Content</Card>);
    expect(container.firstElementChild?.className).toContain('p-6');
  });

  it('renders as a div element', () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });
});
