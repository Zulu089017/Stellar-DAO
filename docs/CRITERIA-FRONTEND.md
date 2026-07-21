# Frontend Quality Criteria

This document defines the quality gates for the StellarDAO web frontend
(`apps/web`). These criteria align with grant platform expectations
(Drips Wave, GrantFox) and ensure a production-grade dashboard.

## Architecture

- **Framework**: Next.js 15 (App Router) with Turbopack dev server
- **Styling**: Tailwind CSS v3 with dark/light theme system
- **State**: React hooks + Horizon SSE events (no global store)
- **Wallet**: Freighter + Albedo browser extension integration
- **Components**: Shared primitives from `@stellardao/ui` package

## Quality Gates

### 1. Type Safety (NON-NEGOTIABLE)
- [ ] Zero TypeScript errors under `strict: true`
- [ ] No `any` types in exported interfaces
- [ ] All props defined with explicit TypeScript interfaces
- [ ] Zod schemas for all API response parsing

### 2. Component Design
- [ ] All interactive elements have hover, focus, and active states
- [ ] Loading skeletons for every async data view
- [ ] Empty states with actionable CTAs (not blank screens)
- [ ] Error boundaries at page and section level
- [ ] Responsive breakpoints: mobile (< 640px), tablet (640-1024px), desktop (> 1024px)

### 3. Real-Time Features
- [ ] SSE connections with automatic reconnection (EventSource retry)
- [ ] Visual indicator when connection is live vs. reconnecting
- [ ] Optimistic UI updates before server confirmation
- [ ] Toast notifications for transaction lifecycle events

### 4. Accessibility (WCAG 2.1 AA)
- [ ] Keyboard navigation for all interactive elements
- [ ] Focus trapping in modals and drawers
- [ ] ARIA labels on icon-only buttons
- [ ] Color contrast ratio ≥ 4.5:1 for text
- [ ] Screen-reader announcements for dynamic content changes

### 5. Performance
- [ ] Lighthouse score ≥ 90 (Performance, Accessibility, Best Practices)
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3.5s
- [ ] No layout shift (CLS < 0.1)
- [ ] Image optimization via `next/image`

### 6. Testing
- [ ] Unit tests for all utility functions (100% coverage)
- [ ] Component tests for critical user flows (wrap, governance, wallet connect)
- [ ] E2E smoke test for dashboard → wrap → transaction lifecycle
- [ ] Responsive layout regression tests at 3 breakpoints

### 7. Code Quality
- [ ] ESLint passes with `@stellardao/eslint-config/react`
- [ ] Prettier formatting applied
- [ ] No console.log in production code (use structured logger)
- [ ] Import order: React → external libs → workspace packages → local

## Dashboard Pages & Features

| Page | Status | Required Features |
|------|--------|-------------------|
| `/` | Live | Chain filter chips, live stats, transaction feed, asset table |
| `/wrap` | Live | Chain selector, token address input, amount, recipient, submit |
| `/assets` | Live | Filterable table with search, chain badges, supply display |
| `/assets/[chain]/[address]` | Live | Asset detail with supply, transactions, bridge status |
| `/transactions` | Live | Paginated list with status dots, chain badges, timestamps |
| `/transactions/[id]` | Live | Full lifecycle with timeline, attestations, Soroban tx link |
| `/governance` | Live | Proposal list with status filter, create proposal CTA |
| `/governance/[id]` | Live | Vote panel, delegate info, execution timeline |
| `/analytics` | Live | TVL, volume, chain breakdown charts |

## Grant Platform Readiness

### Drips Wave Criteria
- [ ] Well-scoped GitHub issues with difficulty labels (trivial/medium/high)
- [ ] `CONTRIBUTING.md` with clear setup instructions
- [ ] PR template with checklist (lint, test, typecheck, screenshots for UI)
- [ ] All components have JSDoc comments explaining purpose

### GrantFox (Stellar/Soroban) Criteria
- [ ] Public GitHub repository with open-source license (MIT)
- [ ] Wallet integration demo (Freighter/Albedo) in README
- [ ] Stellar testnet deployment for live review
- [ ] Milestone-based issue structure for bounties
