use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum RoleManagerError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    RoleAlreadyGranted = 3,
    RoleNotGranted = 4,
    UnauthorizedCaller = 5,
    InvalidRole = 6,
    ZeroAddressNotAllowed = 7,
}
