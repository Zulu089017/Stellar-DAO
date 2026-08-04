# `factory` contract

The factory owns the on-chain registry that maps source-chain tokens to
their dedicated Stellar wrapper-token contracts.

## Lifecycle

1. `initialize(admin, template, bridge)` — registers the wrapper-token
   template and the authorised bridge that will hold mint/burn authority
   for every clone.
2. `create_wrapper(caller, source_chain, source_token, name, symbol, decimals)`
   — clones the template via `Deployer::with_current_contract`, initialises
   the clone with `bridge` as the sole minter/burner, and persists the
   `(source_chain, source_token) → wrapper_token` mapping.
3. `get_wrapper(source_chain, source_token)` — cheap read for the API/relayer.
4. `set_bridge(new_bridge)` — admin-only upgrade hook for when the bridge
   migrates to a newer signature scheme.

Every registry entry is **deterministic** (salt = `sha256("STELLAR_PAYMENT_GATEWAY_FACTORY_V1"
|| source_chain || source_token)`), which means re-running `create_wrapper`
for the same pair returns the existing clone without deploying a new
contract.

## Why deterministic addresses?

The relayer and frontend want to resolve a wrapper-token **before**
submitting any `Lock`-side transaction. A deterministic address lets us
answer `eth_token -> stellar_wrapper` purely from `(source_chain,
source_token)` without inspecting on-chain storage on every call.
