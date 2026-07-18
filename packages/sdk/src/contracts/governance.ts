/**
 * Governance contract bindings for the StellarDAO SDK.
 *
 * Provides typed interfaces for interacting with the governance token,
 * governance proposal contract, and timelock controller from off-chain.
 */

import type { GovernanceProposal, ProposalState, VoteType } from '@stellardao/shared';

export interface GovernanceTokenBindings {
  /** Total supply of governance tokens. */
  totalSupply: () => Promise<bigint>;
  /** Balance of an address. */
  balanceOf: (address: string) => Promise<bigint>;
  /** Get current voting power. */
  getCurrentVotes: (account: string) => Promise<bigint>;
  /** Get historical voting power at a ledger. */
  getPastVotes: (account: string, ledger: number) => Promise<bigint>;
  /** Delegate voting power. */
  delegate: (delegator: string, to: string) => Promise<string>;
}

export interface GovernanceContractBindings {
  /** Create a new proposal. */
  propose: (
    proposer: string,
    description: string,
    actions: Array<{ target: string; fnName: string; calldata: string; value: string }>,
  ) => Promise<number>;
  /** Cast a vote. */
  castVote: (voter: string, proposalId: number, voteType: VoteType) => Promise<string>;
  /** Queue a passed proposal. */
  queue: (proposalId: number) => Promise<number>;
  /** Execute a queued proposal. */
  execute: (proposalId: number) => Promise<string>;
  /** Cancel a proposal. */
  cancel: (proposer: string, proposalId: number) => Promise<string>;
  /** Get proposal by ID. */
  getProposal: (proposalId: number) => Promise<GovernanceProposal>;
  /** Get proposal count. */
  proposalCount: () => Promise<number>;
  /** Check if an address has voted. */
  hasVoted: (proposalId: number, voter: string) => Promise<boolean>;
  /** Get governance config. */
  config: () => Promise<{
    votingPeriod: number;
    votingDelay: number;
    proposalThreshold: bigint;
    quorumNumerator: number;
    quorumDenominator: number;
  }>;
}

export interface TimelockBindings {
  /** Queue a transaction for delayed execution. */
  queueTransaction: (
    target: string,
    value: string,
    fnName: string,
    calldata: string,
  ) => Promise<number>;
  /** Execute a queued transaction. */
  executeTransaction: (
    target: string,
    value: string,
    fnName: string,
    calldata: string,
  ) => Promise<string>;
  /** Cancel a queued transaction. */
  cancelTransaction: (
    target: string,
    value: string,
    fnName: string,
    calldata: string,
  ) => Promise<string>;
}

/**
 * Creates a governance token client for interacting with the
 * on-chain governance token contract.
 */
export function createGovernanceTokenClient(
  contractId: string,
): GovernanceTokenBindings {
  // Placeholder: in production, this would use SorobanRpc + Contract spec.
  return {
    totalSupply: async () => 0n,
    balanceOf: async () => 0n,
    getCurrentVotes: async () => 0n,
    getPastVotes: async () => 0n,
    delegate: async () => contractId,
  };
}

/**
 * Creates a governance proposal client.
 */
export function createGovernanceClient(
  contractId: string,
): GovernanceContractBindings {
  return {
    propose: async () => 0,
    castVote: async () => contractId,
    queue: async () => 0,
    execute: async () => contractId,
    cancel: async () => contractId,
    getProposal: async () => {
      throw new Error('Proposal not found');
    },
    proposalCount: async () => 0,
    hasVoted: async () => false,
    config: async () => ({
      votingPeriod: 40320,
      votingDelay: 7200,
      proposalThreshold: 1000000000000000000000n,
      quorumNumerator: 4,
      quorumDenominator: 100,
    }),
  };
}
