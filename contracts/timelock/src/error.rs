use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum TimelockError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    CallerNotGovernance = 3,
    TransactionNotFound = 4,
    TransactionAlreadyQueued = 5,
    TransactionAlreadyExecuted = 6,
    TransactionAlreadyCanceled = 7,
    TimelockNotExpired = 8,
    InvalidDelay = 9,
    InvalidAdmin = 10,
    InsufficientGracePeriod = 11,
}
