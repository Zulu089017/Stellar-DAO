# Timelock Controller

Delays governance proposal execution to give token holders time to exit
if they disagree with a passed proposal.

## Features

- **Minimum delay**: configurable delay before execution (in ledgers)
- **Grace period**: execution window after delay expires
- **Governance-gated**: only the governance contract can queue transactions
- **Cancel capability**: admin or governance can cancel queued transactions

## Security Model

The timelock is the **final gate** before any governance action takes effect.
This gives the community time to review and, if necessary, fork or exit before
a malicious proposal executes.
