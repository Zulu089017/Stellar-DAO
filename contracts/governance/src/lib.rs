#![no_std]

//! # Governance Contract
//!
//! On-chain DAO governance: proposal creation, voting, queuing, and execution.
//!
//! Token holders with voting power above a configurable threshold create
//! proposals. During the voting period, any token holder can cast their
//! delegated voting power for, against, or abstain. After the period ends,
//! proposals that meet quorum and have majority support are queued in the
//! timelock controller. Once the timelock delay expires, anyone can execute
//! the proposal's calldata against the target contract.

use soroban_sdk::{
    contract, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN, Env,
    IntoVal, Map, String, Symbol, Vec,
};

mod error;
pub use error::GovernanceError;

// ── Types ──────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum VoteType {
    Against = 0,
    For = 1,
    Abstain = 2,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProposalState {
    Pending = 0,
    Active = 1,
    Canceled = 2,
    Defeated = 3,
    Succeeded = 4,
    Queued = 5,
    Executed = 6,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalAction {
    /// Target contract address to call on execution.
    pub target: Address,
    /// Function name to invoke on the target.
    pub fn_name: Symbol,
    /// Serialized calldata args (SCVal-encoded).
    pub calldata: Bytes,
    /// Value (native token amount) to send with the call — typically 0.
    pub value: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Proposal {
    pub id: u32,
    pub proposer: Address,
    pub description: Bytes,
    pub actions: Vec<ProposalAction>,
    pub start_ledger: u32,
    pub end_ledger: u32,
    pub for_votes: i128,
    pub against_votes: i128,
    pub abstain_votes: i128,
    pub state: ProposalState,
    pub eta: u32, // estimated time of execution (ledger number after timelock)
}

// ── Storage Keys ───────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GovDataKey {
    Initialized,
    Admin,
    Token,        // governance token contract address
    Timelock,     // timelock controller address
    VotingPeriod, // in ledgers
    VotingDelay,  // delay before voting starts (ledgers)
    ProposalThreshold, // minimum voting power to propose
    QuorumNumerator,   // quorum as fraction: numerator / denominator
    QuorumDenominator,
    ProposalCount,
    Proposal(u32), // stores Proposal by id
    HasVoted(u32, Address), // proposal id → voter → bool
}

// ── Contract ───────────────────────────────────────────────────────

#[contract]
pub struct Governance;

#[contractimpl]
impl Governance {
    /// Initialize the governance contract.
    ///
    /// `token` is the governance token contract. `timelock` is the address
    /// of the timelock controller. Voting periods are in ledger counts.
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        timelock: Address,
        voting_period: u32,
        voting_delay: u32,
        proposal_threshold: i128,
        quorum_numerator: u32,
        quorum_denominator: u32,
    ) {
        if env.storage().instance().has(&GovDataKey::Initialized) {
            panic_with_error!(env, GovernanceError::AlreadyInitialized);
        }
        admin.require_auth();

        assert!(voting_period > 0, "voting period must be positive");
        assert!(quorum_denominator > 0, "quorum denominator must be positive");
        assert!(
            quorum_numerator <= quorum_denominator,
            "quorum must be <= 100%"
        );

        env.storage().instance().set(&GovDataKey::Initialized, &true);
        env.storage().instance().set(&GovDataKey::Admin, &admin);
        env.storage().instance().set(&GovDataKey::Token, &token);
        env.storage().instance().set(&GovDataKey::Timelock, &timelock);
        env.storage().instance().set(&GovDataKey::VotingPeriod, &voting_period);
        env.storage().instance().set(&GovDataKey::VotingDelay, &voting_delay);
        env.storage().instance().set(&GovDataKey::ProposalThreshold, &proposal_threshold);
        env.storage().instance().set(&GovDataKey::QuorumNumerator, &quorum_numerator);
        env.storage().instance().set(&GovDataKey::QuorumDenominator, &quorum_denominator);
        env.storage().instance().set(&GovDataKey::ProposalCount, &0u32);
    }

    // ── Config queries ─────────────────────────────────────────

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&GovDataKey::Admin).expect("not initialized")
    }

    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&GovDataKey::Token).expect("not initialized")
    }

    pub fn timelock(env: Env) -> Address {
        env.storage().instance().get(&GovDataKey::Timelock).expect("not initialized")
    }

    pub fn voting_period(env: Env) -> u32 {
        env.storage().instance().get(&GovDataKey::VotingPeriod).expect("not initialized")
    }

    pub fn voting_delay(env: Env) -> u32 {
        env.storage().instance().get(&GovDataKey::VotingDelay).expect("not initialized")
    }

    pub fn proposal_threshold(env: Env) -> i128 {
        env.storage().instance().get(&GovDataKey::ProposalThreshold).expect("not initialized")
    }

    pub fn quorum(env: Env) -> (u32, u32) {
        let num: u32 = env.storage().instance().get(&GovDataKey::QuorumNumerator).expect("not initialized");
        let den: u32 = env.storage().instance().get(&GovDataKey::QuorumDenominator).expect("not initialized");
        (num, den)
    }

    pub fn proposal_count(env: Env) -> u32 {
        env.storage().instance().get(&GovDataKey::ProposalCount).unwrap_or(0u32)
    }

    // ── Proposal creation ──────────────────────────────────────

    /// Create a new proposal. The proposer must hold at least `proposal_threshold`
    /// voting power at the current ledger.
    pub fn propose(
        env: Env,
        proposer: Address,
        description: Bytes,
        actions: Vec<ProposalAction>,
    ) -> u32 {
        proposer.require_auth();

        let threshold: i128 = env.storage().instance().get(&GovDataKey::ProposalThreshold).expect("not initialized");
        let token: Address = env.storage().instance().get(&GovDataKey::Token).expect("not initialized");

        // Check proposer voting power via governance token.
        let votes: i128 = env.invoke_contract(
            &token,
            &Symbol::new(&env, "get_current_votes"),
            soroban_sdk::vec![&env, proposer.clone().into_val(&env)],
        );
        if votes < threshold {
            panic_with_error!(env, GovernanceError::InsufficientProposerBalance);
        }

        assert!(!actions.is_empty(), "proposal must have at least one action");
        assert!(description.len() > 0, "description must not be empty");

        let voting_delay: u32 = env.storage().instance().get(&GovDataKey::VotingDelay).expect("not initialized");
        let voting_period: u32 = env.storage().instance().get(&GovDataKey::VotingPeriod).expect("not initialized");
        let current_ledger = env.ledger().sequence();

        let mut count: u32 = env.storage().instance().get(&GovDataKey::ProposalCount).unwrap_or(0u32);
        let id = count;
        count += 1;
        env.storage().instance().set(&GovDataKey::ProposalCount, &count);

        let proposal = Proposal {
            id,
            proposer: proposer.clone(),
            description,
            actions,
            start_ledger: current_ledger + voting_delay,
            end_ledger: current_ledger + voting_delay + voting_period,
            for_votes: 0i128,
            against_votes: 0i128,
            abstain_votes: 0i128,
            state: ProposalState::Pending,
            eta: 0u32,
        };

        env.storage().persistent().set(&GovDataKey::Proposal(id), &proposal);

        env.events().publish(
            (Symbol::new(&env, "governance"), Symbol::new(&env, "ProposalCreated")),
            (id, proposer, proposal.start_ledger, proposal.end_ledger),
        );

        id
    }

    // ── Voting ─────────────────────────────────────────────────

    /// Cast a vote on an active proposal. Voting power is read from the
    /// governance token at `proposal.start_ledger`.
    pub fn cast_vote(env: Env, voter: Address, proposal_id: u32, vote_type: VoteType) {
        voter.require_auth();

        let mut proposal: Proposal = env.storage()
            .persistent()
            .get(&GovDataKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(env, GovernanceError::ProposalNotFound));

        let current_ledger = env.ledger().sequence();

        if proposal.state == ProposalState::Pending && current_ledger >= proposal.start_ledger {
            proposal.state = ProposalState::Active;
        }

        if proposal.state != ProposalState::Active {
            panic_with_error!(env, GovernanceError::ProposalNotActive);
        }
        if current_ledger > proposal.end_ledger {
            panic_with_error!(env, GovernanceError::VotingPeriodOver);
        }

        let has_voted: bool = env.storage()
            .persistent()
            .get(&GovDataKey::HasVoted(proposal_id, voter.clone()))
            .unwrap_or(false);
        if has_voted {
            panic_with_error!(env, GovernanceError::AlreadyVoted);
        }

        let token: Address = env.storage().instance().get(&GovDataKey::Token).expect("not initialized");

        // Read voting power at proposal start ledger.
        let voting_power: i128 = env.invoke_contract(
            &token,
            &Symbol::new(&env, "get_past_votes"),
            soroban_sdk::vec![&env, voter.clone().into_val(&env), proposal.start_ledger.into_val(&env)],
        );
        if voting_power <= 0 {
            panic_with_error!(env, GovernanceError::NoVotingPower);
        }

        env.storage().persistent().set(&GovDataKey::HasVoted(proposal_id, voter.clone()), &true);

        match vote_type {
            VoteType::For => proposal.for_votes += voting_power,
            VoteType::Against => proposal.against_votes += voting_power,
            VoteType::Abstain => proposal.abstain_votes += voting_power,
        }

        env.storage().persistent().set(&GovDataKey::Proposal(proposal_id), &proposal);

        let voter_clone = voter.clone();
        env.events().publish(
            (Symbol::new(&env, "governance"), Symbol::new(&env, "VoteCast")),
            (proposal_id, voter_clone, vote_type, voting_power),
        );
    }

    // ── Queue ──────────────────────────────────────────────────

    /// Queue a succeeded proposal in the timelock. Can be called by anyone
    /// after the voting period ends if the proposal passed.
    pub fn queue(env: Env, proposal_id: u32) -> u32 {
        let mut proposal: Proposal = env.storage()
            .persistent()
            .get(&GovDataKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(env, GovernanceError::ProposalNotFound));

        // Finalize state if voting is over.
        if proposal.state == ProposalState::Active {
            let current = env.ledger().sequence();
            if current > proposal.end_ledger {
                let (quorum_num, quorum_den) = Self::quorum(env.clone());
                let token: Address = env.storage().instance().get(&GovDataKey::Token).expect("not initialized");
                let total_supply: i128 = env.invoke_contract(
                    &token,
                    &Symbol::new(&env, "total_supply"),
                    soroban_sdk::vec![&env],
                );

                let total_votes = proposal.for_votes + proposal.against_votes + proposal.abstain_votes;
                let required = total_supply
                    .checked_mul(quorum_num as i128)
                    .unwrap_or(0)
                    .checked_div(quorum_den as i128)
                    .unwrap_or(0);

                if total_votes < required {
                    proposal.state = ProposalState::Defeated;
                } else if proposal.for_votes > proposal.against_votes {
                    proposal.state = ProposalState::Succeeded;
                } else {
                    proposal.state = ProposalState::Defeated;
                }
            }
        }

        if proposal.state != ProposalState::Succeeded {
            panic_with_error!(env, GovernanceError::ProposalDefeated);
        }

        let timelock_addr: Address = env.storage().instance().get(&GovDataKey::Timelock).expect("not initialized");

        // Queue each action in the timelock.
        let mut eta: u32 = 0;
        for action in proposal.actions.iter() {
            let result: u32 = env.invoke_contract(
                &timelock_addr,
                &Symbol::new(&env, "queue_transaction"),
                soroban_sdk::vec![
                    &env,
                    action.target.into_val(&env),
                    action.value.into_val(&env),
                    action.fn_name.into_val(&env),
                    action.calldata.into_val(&env),
                ],
            );
            eta = result;
        }

        proposal.state = ProposalState::Queued;
        proposal.eta = eta;
        env.storage().persistent().set(&GovDataKey::Proposal(proposal_id), &proposal);

        env.events().publish(
            (Symbol::new(&env, "governance"), Symbol::new(&env, "ProposalQueued")),
            (proposal_id, eta),
        );

        eta
    }

    // ── Execute ────────────────────────────────────────────────

    /// Execute a queued proposal after its timelock delay has passed.
    pub fn execute(env: Env, proposal_id: u32) {
        let mut proposal: Proposal = env.storage()
            .persistent()
            .get(&GovDataKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(env, GovernanceError::ProposalNotFound));

        if proposal.state != ProposalState::Queued {
            panic_with_error!(env, GovernanceError::ProposalNotActive);
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger < proposal.eta {
            panic_with_error!(env, GovernanceError::TimelockNotExpired);
        }

        let timelock_addr: Address = env.storage().instance().get(&GovDataKey::Timelock).expect("not initialized");

        // Execute each action via the timelock.
        for action in proposal.actions.iter() {
            env.invoke_contract::<()>(
                &timelock_addr,
                &Symbol::new(&env, "execute_transaction"),
                soroban_sdk::vec![
                    &env,
                    action.target.into_val(&env),
                    action.value.into_val(&env),
                    action.fn_name.into_val(&env),
                    action.calldata.into_val(&env),
                ],
            );
        }

        proposal.state = ProposalState::Executed;
        env.storage().persistent().set(&GovDataKey::Proposal(proposal_id), &proposal);

        env.events().publish(
            (Symbol::new(&env, "governance"), Symbol::new(&env, "ProposalExecuted")),
            (proposal_id,),
        );
    }

    // ── Cancel ─────────────────────────────────────────────────

    /// Cancel a proposal. Only the proposer can cancel before execution.
    pub fn cancel(env: Env, proposer: Address, proposal_id: u32) {
        proposer.require_auth();

        let mut proposal: Proposal = env.storage()
            .persistent()
            .get(&GovDataKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(env, GovernanceError::ProposalNotFound));

        if proposal.proposer != proposer {
            panic_with_error!(env, GovernanceError::ProposalNotActive);
        }
        if proposal.state == ProposalState::Executed
            || proposal.state == ProposalState::Canceled
        {
            panic_with_error!(env, GovernanceError::ProposalAlreadyExecuted);
        }

        proposal.state = ProposalState::Canceled;
        env.storage().persistent().set(&GovDataKey::Proposal(proposal_id), &proposal);

        env.events().publish(
            (Symbol::new(&env, "governance"), Symbol::new(&env, "ProposalCanceled")),
            (proposal_id,),
        );
    }

    // ── Proposal query ─────────────────────────────────────────

    pub fn get_proposal(env: Env, proposal_id: u32) -> Proposal {
        env.storage()
            .persistent()
            .get(&GovDataKey::Proposal(proposal_id))
            .unwrap_or_else(|| panic_with_error!(env, GovernanceError::ProposalNotFound))
    }

    pub fn has_voted(env: Env, proposal_id: u32, voter: Address) -> bool {
        env.storage()
            .persistent()
            .get(&GovDataKey::HasVoted(proposal_id, voter))
            .unwrap_or(false)
    }

    // ── Admin setters ──────────────────────────────────────────

    pub fn set_voting_period(env: Env, period: u32) {
        let admin: Address = env.storage().instance().get(&GovDataKey::Admin).expect("not initialized");
        admin.require_auth();
        assert!(period > 0, "voting period must be positive");
        env.storage().instance().set(&GovDataKey::VotingPeriod, &period);
    }

    pub fn set_proposal_threshold(env: Env, threshold: i128) {
        let admin: Address = env.storage().instance().get(&GovDataKey::Admin).expect("not initialized");
        admin.require_auth();
        env.storage().instance().set(&GovDataKey::ProposalThreshold, &threshold);
    }

    pub fn set_quorum(env: Env, numerator: u32, denominator: u32) {
        let admin: Address = env.storage().instance().get(&GovDataKey::Admin).expect("not initialized");
        admin.require_auth();
        assert!(denominator > 0, "denominator must be positive");
        assert!(numerator <= denominator, "quorum must be <= 100%");
        env.storage().instance().set(&GovDataKey::QuorumNumerator, &numerator);
        env.storage().instance().set(&GovDataKey::QuorumDenominator, &denominator);
    }
}
