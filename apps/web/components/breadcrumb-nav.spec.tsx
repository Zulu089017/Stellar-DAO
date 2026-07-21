import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BreadcrumbNav, breadcrumbs } from './breadcrumb-nav';

describe('BreadcrumbNav', () => {
  it('renders a single segment as text', () => {
    render(<BreadcrumbNav segments={[{ label: 'Home' }]} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('renders multiple segments with separators', () => {
    render(
      <BreadcrumbNav
        segments={[
          { label: 'Home', href: '/' },
          { label: 'Governance', href: '/governance' },
          { label: 'Proposal #3' },
        ]}
      />,
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('Proposal #3')).toBeInTheDocument();
  });

  it('renders clickable links for segments with href', () => {
    render(
      <BreadcrumbNav
        segments={[
          { label: 'Home', href: '/' },
          { label: 'Assets', href: '/assets' },
        ]}
      />,
    );
    const homeLink = screen.getByText('Home');
    const assetsLink = screen.getByText('Assets');
    // Links should be rendered as Next.js Link components
    expect(homeLink).toBeInTheDocument();
    expect(assetsLink).toBeInTheDocument();
  });

  it('last segment is rendered as text, not a link', () => {
    render(
      <BreadcrumbNav
        segments={[
          { label: 'Home', href: '/' },
          { label: 'Current' },
        ]}
      />,
    );
    const current = screen.getByText('Current');
    expect(current.tagName).toBe('SPAN');
  });

  it('renders with aria-label for accessibility', () => {
    render(<BreadcrumbNav segments={[{ label: 'Home' }]} />);
    expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'Breadcrumb');
  });
});

describe('breadcrumbs helper', () => {
  it('governance path includes Home, Governance, and optional proposal id', () => {
    const withId = breadcrumbs.governance('5');
    expect(withId).toHaveLength(3);
    expect(withId[2]?.label).toBe('Proposal #5');
    expect(withId[2]?.href).toBeUndefined();

    const withoutId = breadcrumbs.governance();
    expect(withoutId).toHaveLength(2);
    expect(withoutId[1]?.label).toBe('Governance');
  });

  it('assets path includes chain and truncated address', () => {
    const withAddr = breadcrumbs.assets('ethereum', '0x1234567890abcdef1234567890abcdef12345678');
    expect(withAddr).toHaveLength(4);
    expect(withAddr[2]?.label).toBe('ethereum');
    expect(withAddr[3]?.label).toContain('…');
  });
});
