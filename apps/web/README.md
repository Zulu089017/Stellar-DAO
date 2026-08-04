# `@stellar-payment-gateway/web`

Next.js 15 dashboard for Stellar Payment Gateway. App Router, React Server Components for
the data-heavy pages, client components for the live feed, wallet connect,
and the wrap form. Styling is built on top of Tailwind with a small set of
design tokens (`stellar-*` colors, `aurora-gradient`, `glow` shadow).

## Pages

| Route                                  | Purpose                                |
|----------------------------------------|----------------------------------------|
| `/`                                    | Landing: hero, live stats, registry, live feed |
| `/wrap`                                | Interactive wrap form + progress       |
| `/assets`                              | Full registry                          |
| `/assets/[chain]/[address]`            | Asset detail + live events             |
| `/transactions`                        | Filterable, typeahead-searchable feed  |
| `/api/health`                          | Horizon liveness + contract IDs        |

## Stack

- **Next 15** (App Router, Server Components, Route Handlers)
- **React 19 RC**
- **TailwindCSS** with custom design tokens
- **TanStack React Query**
- **`@stellar/stellar-sdk`** for transaction building on the client
- **`@stellar-payment-gateway/shared` / `sdk` / `ui`** from the rest of the polyrepo

## Local development

```bash
pnpm dev                  # start next.js on :3000
pnpm --filter @stellar-payment-gateway/api dev       # in another shell
```

The landing page reads from `NEXT_PUBLIC_API_BASE_URL` (defaults to
`http://localhost:4000`) and falls back to empty data if the API is not
running, so it always renders.

## Live feed

`/api/events` on the Next.js side and `/api/events` on the API side both
relay contract events. The frontend opens an `EventSource` and surfaces
incoming `MintRequested` / `BurnRequested` events on the dashboard, asset
detail, and full transactions page.
