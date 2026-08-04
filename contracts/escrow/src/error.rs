use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    EscrowAlreadyExists = 3,
    EscrowNotFound = 4,
    InvalidAmount = 5,
    InvalidExpiration = 6,
    EscrowAlreadyFunded = 7,
    EscrowNotFunded = 8,
    EscrowExpired = 9,
    EscrowNotExpired = 10,
    UnauthorizedCaller = 11,
    EscrowAlreadyDisputed = 12,
    EscrowNotDisputed = 13,
    EscrowAlreadyResolved = 14,
    InsufficientBalance = 15,
    Overflow = 16,
    InvalidResolution = 17,
    ZeroAddressNotAllowed = 18,
}
