# Governance Contract

On-chain proposal creation, voting, and execution for StellarDAO.

## Features

- **Proposal creation**: token holders above a configurable threshold can create proposals
- **Quadratic and single-choice voting**: supports multiple vote types
- **Quorum-based execution**: proposals require minimum participation
- **Timelock integration**: successful proposals route through a timelock before execution
- **Executable actions**: proposals can call arbitrary Soroban contracts

## Interface

| Function | Auth | Description |
|----------|------|-------------|
| `initialize` | admin | Set governance token, timelock, and parameters |
| `propose` | proposer | Create a new proposal |
| `cast_vote` | voter | Vote for/against/abstain on active proposal |
| `queue` | anyone | Queue passed proposal in timelock |
| `execute` | anyone | Execute queued proposal after timelock |
| `cancel` | proposer | Cancel own proposal before execution |
| `get_proposal` | — | Read full proposal state |
| `proposal_count` | — | Total proposals created |
| `quorum` | — | Current quorum threshold |

## Proposal lifecycle

```
Pending ──► Active (voting period) ──► Succeeded ──► Queued (timelock) ──► Executed
                │                          │
                └──► Defeated              └──► Canceled (before queue)
```
