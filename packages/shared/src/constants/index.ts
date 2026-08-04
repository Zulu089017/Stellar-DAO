/** Enum names as strings — matches the Soroban Symbol names emitted by contracts. */
export const Events = {
  BRIDGE_MINT: 'MintRequested',
  BRIDGE_BURN: 'BurnRequested',
  FACTORY_WRAPPER_CREATED: 'WrapperCreated',
  WRAPPER_MINT: 'Mint',
  WRAPPER_BURN: 'Burn',
  WRAPPER_TRANSFER: 'Transfer',
} as const;

/** Stellar network passphrase prefixes used for transaction signing. */
export const NetworkPassphrases = {
  PUBLIC: 'Public Global Stellar Network ; September 2015',
  TESTNET: 'Test SDF Network ; September 2015',
  FUTURENET: 'Test SDF Future Network ; October 2022',
} as const;

/** Public Horizon REST endpoints per network for the frontend shortcut. */
export const HorizonPaths = {
  ROOT: '/',
  TRANSACTIONS: '/transactions',
  OPERATIONS: '/operations',
  EFFECTS: '/effects',
  PAYMENTS: '/payments',
  EVENTS: '/events',
  LEDGERS: '/ledgers',
} as const;

/** Domain tags that prefix every signed payload. */
export const SIGNATURE_TAGS = {
  LOCK_V1: 'STELLAR_PAYMENT_GATEWAY_LOCK_V1',
  UNLOCK_V1: 'STELLAR_PAYMENT_GATEWAY_UNLOCK_V1',
  FACTORY_V1: 'STELLAR_PAYMENT_GATEWAY_FACTORY_V1',
} as const;
