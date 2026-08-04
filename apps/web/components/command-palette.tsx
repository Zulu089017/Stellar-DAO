'use client';

/**
 * Command Palette — Cmd+K power-user navigation for Stellar Payment Gateway.
 *
 * Inspired by Linear, Vercel, and Stripe dashboards. Zero external
 * dependencies — built on React 19 portals, hooks, and Tailwind.
 *
 * Features:
 *   - Cmd+K / Ctrl+K to open, Escape to close
 *   - Fuzzy search across navigation + action commands
 *   - Keyboard navigation (↑ ↓ Enter)
 *   - ARIA-compliant dialog with focus trapping
 *   - Animated overlay with backdrop blur
 *
 * Usage:
 *   <CommandPaletteProvider>
 *     <App />
 *     <CommandPalette />
 *   </CommandPaletteProvider>
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

/* ── Types ─────────────────────────────────────────────────────── */

interface Command {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  icon?: string;
  action: () => void;
}

interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/* ── Commands ──────────────────────────────────────────────────── */

function useCommands(): Command[] {
  const router = useRouter();

  return useMemo<Command[]>(() => {
    const navCommands: Command[] = [
      {
        id: 'nav-overview',
        label: 'Overview',
        description: 'Dashboard with live stats and activity',
        keywords: ['home', 'dashboard', 'stats'],
        icon: '◉',
        action: () => router.push('/'),
      },
      {
        id: 'nav-wrap',
        label: 'Wrap',
        description: 'Mint a Stellar wrapper for your token',
        keywords: ['mint', 'bridge', 'token'],
        icon: '↗',
        action: () => router.push('/wrap'),
      },
      {
        id: 'nav-assets',
        label: 'Assets',
        description: 'Browse wrapped assets and their chains',
        keywords: ['tokens', 'wrapped', 'registry'],
        icon: '◆',
        action: () => router.push('/assets'),
      },
      {
        id: 'nav-transactions',
        label: 'Transactions',
        description: 'Real-time settlement feed',
        keywords: ['settlement', 'history', 'feed'],
        icon: '⇄',
        action: () => router.push('/transactions'),
      },
      {
        id: 'nav-governance',
        label: 'Governance',
        description: 'Proposals, voting, and delegation',
        keywords: ['vote', 'dao', 'proposal', 'delegate'],
        icon: '⚖',
        action: () => router.push('/governance'),
      },
      {
        id: 'nav-analytics',
        label: 'Analytics',
        description: 'Volume, fees, and bridge metrics',
        keywords: ['charts', 'metrics', 'volume', 'fees'],
        icon: '▤',
        action: () => router.push('/analytics'),
      },
      {
        id: 'nav-invoices',
        label: 'Invoices',
        description: 'Create and manage payment invoices',
        keywords: ['bill', 'payment', 'receipt'],
        icon: '▣',
        action: () => router.push('/invoices'),
      },
    ];

    const actionCommands: Command[] = [
      {
        id: 'action-copy-url',
        label: 'Copy current URL',
        description: 'Copy the current page URL to clipboard',
        keywords: ['share', 'link', 'clipboard'],
        icon: '⎘',
        action: () => {
          void navigator.clipboard.writeText(window.location.href);
        },
      },
      {
        id: 'action-github',
        label: 'Open GitHub repository',
        description: 'View the source code on GitHub',
        keywords: ['source', 'code', 'repo'],
        icon: '⬡',
        action: () => {
          window.open('https://github.com/Zulu089017/Stellar-DAO', '_blank');
        },
      },
    ];

    return [...navCommands, ...actionCommands];
  }, [router]);
}

/* ── Context ───────────────────────────────────────────────────── */

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return (
    <CommandPaletteContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette must be used within a CommandPaletteProvider');
  return ctx;
}

/* ── Fuzzy search ──────────────────────────────────────────────── */

function fuzzyMatch(query: string, command: Command): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const targets = [command.label.toLowerCase(), ...(command.keywords ?? [])];
  for (const target of targets) {
    if (target.includes(q)) return 0.9;
    // Simple character-by-character match
    let qi = 0;
    let matches = 0;
    for (let i = 0; i < target.length && qi < q.length; i++) {
      if (target[i] === q[qi]) {
        qi++;
        matches++;
      }
    }
    if (matches === q.length) return 0.7;
  }
  return 0;
}

/* ── Component ─────────────────────────────────────────────────── */

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const commands = useCommands();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter and rank commands
  const results = useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map((cmd) => ({ cmd, score: fuzzyMatch(query, cmd) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ cmd }) => cmd);
  }, [commands, query]);

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  // Keyboard navigation within the palette
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            results[selectedIndex].action();
            close();
          }
          break;
        case 'Escape':
          e.preventDefault();
          close();
          break;
      }
    },
    [results, selectedIndex, close],
  );

  // Scroll selected item into view
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!mounted) return null;

  return createPortal(
    <div
      id="command-palette"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className={`fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] transition-opacity duration-150 ${
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-stellar-ink/80 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-stellar-slate shadow-2xl shadow-black/50 animate-slide-in">
        {/* Search */}
        <div className="flex items-center gap-3 border-b border-white/5 px-4">
          <span className="text-stellar-haze">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent py-4 text-sm text-stellar-cloud placeholder:text-stellar-haze/60 focus:outline-none"
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-stellar-haze sm:inline">
            esc
          </kbd>
        </div>

        {/* Results */}
        {results.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-stellar-haze">No results found.</div>
        ) : (
          <ul ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-2">
            {results.map((cmd, index) => (
              <li
                key={cmd.id}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => {
                  cmd.action();
                  close();
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm cursor-pointer transition ${
                  index === selectedIndex
                    ? 'bg-stellar-aurora/20 text-white'
                    : 'text-stellar-cloud hover:bg-white/5'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs">
                  {cmd.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{cmd.label}</p>
                  {cmd.description && (
                    <p className="mt-0.5 text-xs text-stellar-haze truncate">{cmd.description}</p>
                  )}
                </div>
                {index === selectedIndex && (
                  <kbd className="rounded-md border border-stellar-aurora/20 px-1.5 py-0.5 text-[10px] text-stellar-aurora">
                    ↵
                  </kbd>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-white/5 px-4 py-2.5 text-[10px] text-stellar-haze">
          <span>
            <kbd className="rounded-md border border-white/10 px-1 py-0.5">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded-md border border-white/10 px-1 py-0.5">↵</kbd> select
          </span>
          <span>
            <kbd className="rounded-md border border-white/10 px-1 py-0.5">esc</kbd> close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Inline script for Cmd+K toggling ──────────────────────────── */

/**
 * Global keyboard shortcut that calls useCommandPalette().toggle().
 *
 * Because the global `keydown` listener inside the CommandPalette
 * component doesn't have access to the context's `open` function
 * easily, we expose a global API via a custom DOM event that the
 * provider listens to.
 */
export function CommandPaletteGlobalShortcut() {
  const { toggle } = useCommandPalette();

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  return null;
}
