use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum FeeManagerError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidFeeBps = 3,
    FeeExceedsMaximum = 4,
    InvalidTier = 5,
    MerchantNotFound = 6,
    UnauthorizedCaller = 7,
    InvalidVolumeThreshold = 8,
    Overflow = 9,
}
