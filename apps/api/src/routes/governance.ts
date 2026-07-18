import type { FastifyInstance } from 'fastify';

/**
 * Governance REST routes for the DAO governance system.
 *
 * These endpoints proxy to the on-chain governance contract for
 * proposal listing, voting, and delegation operations.
 */

// ── Types ─────────────────────────────────────────────────────

interface ProposalResponse {
  id: number;
  proposer: string;
  description: string;
  status: string;
  forVotes: string;
  againstVotes: string;
  abstainVotes: string;
  startLedger: number;
  endLedger: number;
  eta: number;
  actions: Array<{
    target: string;
    fnName: string;
    value: string;
  }>;
}

interface GovernanceStats {
  totalProposals: number;
  activeProposals: number;
  executedProposals: number;
  totalVoters: number;
  quorumNumerator: number;
  quorumDenominator: number;
  votingPeriod: number;
  proposalThreshold: string;
}

// ── Routes ────────────────────────────────────────────────────

export const governanceRoutes = async (app: FastifyInstance): Promise<void> => {
  /**
   * GET /governance/stats
   *
   * Returns aggregate governance statistics.
   */
  app.get('/stats', async (_req, reply) => {
    const stats: GovernanceStats = {
      totalProposals: 0,
      activeProposals: 0,
      executedProposals: 0,
      totalVoters: 0,
      quorumNumerator: 4,
      quorumDenominator: 100,
      votingPeriod: 40320, // ~7 days in ledgers
      proposalThreshold: '1000000000000000000000', // 1000 tokens
    };

    return reply.send(stats);
  });

  /**
   * GET /governance/proposals
   *
   * List all governance proposals with optional status filter.
   */
  app.get<{ Querystring: { status?: string; limit?: number; cursor?: number } }>(
    '/proposals',
    async (req, reply) => {
      const limit = Math.min(req.query.limit ?? 20, 100);

      // Placeholder: in production this reads from the governance contract
      // or an indexed database view.
      const proposals: ProposalResponse[] = [];

      return reply.send({
        proposals,
        cursor: proposals.length > 0 ? proposals[proposals.length - 1].id : null,
      });
    },
  );

  /**
   * GET /governance/proposals/:id
   *
   * Get a single proposal by ID.
   */
  app.get<{ Params: { id: string } }>(
    '/proposals/:id',
    async (req, reply) => {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return reply.code(400).send({ error: 'invalid_proposal_id' });
      }

      // Placeholder: read from governance contract.
      return reply.code(404).send({ error: 'proposal_not_found' });
    },
  );

  /**
   * POST /governance/proposals/:id/vote
   *
   * Cast a vote on an active proposal.
   */
  app.post<{
    Params: { id: string };
    Body: { voter: string; voteType: 'for' | 'against' | 'abstain' };
  }>('/proposals/:id/vote', async (req, reply) => {
    const { voter, voteType } = req.body;

    if (!voter || !voteType) {
      return reply.code(400).send({
        error: 'validation_failed',
        message: 'voter and voteType are required',
      });
    }

    if (!['for', 'against', 'abstain'].includes(voteType)) {
      return reply.code(400).send({
        error: 'validation_failed',
        message: 'voteType must be one of: for, against, abstain',
      });
    }

    // Placeholder: submit vote to governance contract.
    return reply.code(202).send({
      proposalId: parseInt(req.params.id, 10),
      voter,
      voteType,
      status: 'accepted',
    });
  });

  /**
   * GET /governance/delegates/:address
   *
   * Get delegation info for an address.
   */
  app.get<{ Params: { address: string } }>(
    '/delegates/:address',
    async (req, reply) => {
      const { address } = req.params;

      return reply.send({
        address,
        delegate: address,
        votingPower: '0',
        proposalsVoted: 0,
      });
    },
  );
};
