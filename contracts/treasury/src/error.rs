use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum TreasuryError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientBalance = 4,
    Overflow = 5,
    UnauthorizedCaller = 6,
    TreasuryPaused = 7,
    InvalidAsset = 8,
}
