use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum PaymentError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientBalance = 4,
    Overflow = 5,
    UnauthorizedTransfer = 6,
    InvalidBatchSize = 7,
    FeeExceedsMaximum = 8,
    PaymentPaused = 9,
    InvalidAsset = 10,
}
