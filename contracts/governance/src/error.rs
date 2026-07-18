use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum GovernanceError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    ProposalNotFound = 3,
    ProposalNotActive = 4,
    ProposalAlreadyExecuted = 5,
    VotingPeriodOver = 6,
    VotingPeriodNotOver = 7,
    AlreadyVoted = 8,
    NoVotingPower = 9,
    QuorumNotReached = 10,
    ProposalDefeated = 11,
    TimelockNotExpired = 12,
    InvalidProposalType = 13,
    CallerNotTimelock = 14,
    InvalidDescription = 15,
    InsufficientProposerBalance = 16,
    ProposalThresholdNotMet = 17,
}
