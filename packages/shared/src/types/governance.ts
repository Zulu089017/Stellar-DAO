import { z } from 'zod';

// ── Governance Types ──────────────────────────────────────────

export const VoteTypeSchema = z.enum(['for', 'against', 'abstain']);
export type VoteType = z.infer<typeof VoteTypeSchema>;

export const ProposalStateSchema = z.enum([
  'pending',
  'active',
  'canceled',
  'defeated',
  'succeeded',
  'queued',
  'executed',
]);
export type ProposalState = z.infer<typeof ProposalStateSchema>;

export const ProposalActionSchema = z.object({
  target: z.string(),
  fnName: z.string(),
  calldata: z.string(),
  value: z.string(),
});
export type ProposalAction = z.infer<typeof ProposalActionSchema>;

export interface GovernanceProposal {
  id: number;
  proposer: string;
  description: string;
  actions: ProposalAction[];
  startLedger: number;
  endLedger: number;
  forVotes: string;
  againstVotes: string;
  abstainVotes: string;
  state: ProposalState;
  eta: number;
}

export interface GovernanceConfig {
  votingPeriod: number;
  votingDelay: number;
  proposalThreshold: string;
  quorumNumerator: number;
  quorumDenominator: number;
}

export interface DelegateInfo {
  address: string;
  delegate: string;
  votingPower: string;
  proposalsVoted: number;
  proposalsCreated: number;
}

// ── Analytics Types ───────────────────────────────────────────

export interface ChainMetrics {
  tvl: string;
  volume: string;
  transactions: number;
  wraps: number;
  unwraps: number;
}

export interface ProtocolAnalytics {
  tvl: string;
  totalVolume24h: string;
  totalTransactions: number;
  activeUsers: number;
  uniqueAssets: number;
  activeRelayers: number;
  feeRevenue: string;
  chains: Record<string, ChainMetrics>;
  updatedAt: string;
}

export interface SystemHealth {
  status: 'ok' | 'degraded' | 'down';
  uptime: number;
  memory: NodeJS.MemoryUsage;
  timestamp: string;
  checks: Record<string, 'ok' | 'degraded' | 'down' | 'unknown'>;
}
