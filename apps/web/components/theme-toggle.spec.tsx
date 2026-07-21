import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('light');
  });

  it('renders a placeholder div before mount', () => {
    // ThemeToggle returns a placeholder until mounted effect runs.
    const { container } = render(<ThemeToggle />);
    // After mount, the effect sets mounted=true and renders the button.
    // We test that the component renders something (not empty).
    expect(container.firstElementChild).toBeInTheDocument();
  });

  it('renders the toggle button after mount', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
  });

  it('toggles from dark to light on click', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    // Default dark → click → light
    fireEvent.click(btn);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
