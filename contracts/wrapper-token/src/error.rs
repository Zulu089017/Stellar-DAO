use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum TokenError {
    AlreadyInitialized = 1,
    InvalidAmount = 2,
    Overflow = 3,
    InsufficientBalance = 4,
    InsufficientAllowance = 5,
    AllowanceExpired = 6,
}
