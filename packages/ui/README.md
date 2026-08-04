# `@stellar-payment-gateway/ui`

Reusable React primitives styled against the Stellar Payment Gateway design tokens
defined in `apps/web/tailwind.config.ts`. Apps that consume this
package should add the same Tailwind theme (or import the tokens
package) so classes like `from-stellar-aurora` resolve.

```tsx
import { Button, Card, CardHeader, CardBody, StatusDot } from '@stellar-payment-gateway/ui';

<Card>
  <CardHeader><h3>Mint #1</h3></CardHeader>
  <CardBody>
    <StatusDot status="minting" />
    <Button variant="primary">Submit</Button>
  </CardBody>
</Card>
```

## Components

| Component        | Purpose |
|------------------|---------|
| `Button`         | Three variants (primary/secondary/ghost) with focus ring |
| `Card`           | Glass panel with optional Header/Body/Footer subslots |
| `Skeleton`       | Shimmer placeholder bar |
| `StatusDot`      | Colored pulse indicator for transaction status |

The only utility exported is `cn(...classes)` which merges Tailwind
class lists defensively. Apps should not redefine this.
