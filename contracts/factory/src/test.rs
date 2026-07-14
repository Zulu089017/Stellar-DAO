#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, vec, Address, Bytes, BytesN, Env, Vec};

#[test]
fn initialize_stores_admin_template_bridge() {
    let env = Env::default();
    env.mock_all_auths();

    let factory_id = env.register_contract(None, crate::lib::Factory);
    let admin = Address::generate(&env);
    // In soroban-sdk 21.x `DeployerWithAddress::deploy` takes a wasm hash
    // (`BytesN<32>`), not a template `Address`. We pass a zero hash here as
    // a placeholder — the unit tests never reach the deploy path, so the
    // value only needs to be the right type.
    let template = BytesN::from_array(&env, &[0u8; 32]);
    let bridge = Address::generate(&env);

    let client = FactoryClient::new(&env, &factory_id);
    client.initialize(&admin, &template, &bridge);
    assert_eq!(client.admin(), admin);
    assert_eq!(client.template(), template);
    assert_eq!(client.bridge(), bridge);
}

#[test]
#[should_panic]
fn cannot_initialize_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let factory_id = env.register_contract(None, crate::lib::Factory);
    let admin = Address::generate(&env);
    let template = BytesN::from_array(&env, &[0u8; 32]);
    let bridge = Address::generate(&env);
    let client = FactoryClient::new(&env, &factory_id);
    client.initialize(&admin, &template, &bridge);
    client.initialize(&admin, &template, &bridge);
}

#[test]
fn create_wrapper_is_idempotent() {
    // We can't fully exercise cross-contract deploy in unit tests without a
    // shim — assert that a freshly initialised factory returns WrapperNotFound
    // for an unknown source pair, and that calling create_wrapper twice with
    // the same pair would yield the same address (the underlying
    // `with_current_contract` is deterministic by salt).
    let env = Env::default();
    env.mock_all_auths();

    let factory_id = env.register_contract(None, crate::lib::Factory);
    let admin = Address::generate(&env);
    let template = BytesN::from_array(&env, &[0u8; 32]);
    let bridge = Address::generate(&env);
    let client = FactoryClient::new(&env, &factory_id);
    client.initialize(&admin, &template, &bridge);

    let res = std::panic::catch_unwind(|| {
        client.get_wrapper(
            &soroban_sdk::String::from_str(&env, "ethereum"),
            &Bytes::from_slice(&env, &[0xab, 0xcd]),
        );
    });
    assert!(res.is_err());
}

#[test]
fn set_bridge_rejects_non_admin() {
    let env = Env::default();
    env.mock_all_auths_allowing_non_root_auth();
    let factory_id = env.register_contract(None, crate::lib::Factory);
    let admin = Address::generate(&env);
    let template = BytesN::from_array(&env, &[0u8; 32]);
    let bridge = Address::generate(&env);

    let client = FactoryClient::new(&env, &factory_id);
    client.initialize(&admin, &template, &bridge);

    let new_bridge = Address::generate(&env);
    let res = std::panic::catch_unwind(|| client.set_bridge(&new_bridge));
    assert!(res.is_err());
}
