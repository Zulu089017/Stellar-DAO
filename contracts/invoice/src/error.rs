use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum InvoiceError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvoiceAlreadyExists = 3,
    InvoiceNotFound = 4,
    InvalidAmount = 5,
    InvalidExpiration = 6,
    InvoiceAlreadyPaid = 7,
    InvoiceExpired = 8,
    InvoiceAlreadyCancelled = 9,
    UnauthorizedCaller = 10,
    PaymentExceedsAmount = 11,
    InvoiceNotPayable = 12,
    Overflow = 13,
    ZeroAmount = 14,
}
