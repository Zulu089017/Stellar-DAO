#!/usr/bin/env tsx
/**
 * Deploy the Soroban contracts and write their IDs into the root .env.
 *
 *   - `bridge` is deployed first.
 *   - `wrapper-token` template is deployed next (init: admin/bridge/name/symbol/decimals).
 *   - `factory` is deployed last, referencing both prior ids.
 *
 * Requirements:
 *   stellar-cli installed (https://developers.stellar.org/docs/tools/developer-tools)
 *   Source-account keys available (default pulls from $STELLAR_PAYMENT_GATEWAY_DEPLOYER_SECRET).
 */

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const envPath = resolve(root, '.env');

const log = (...args: unknown[]) => console.log('[deploy]', ...args);
const error = (...args: unknown[]) => console.error('[deploy] ✗', ...args);

const run = (cmd: string, args: string[]) =>
  new Promise<string>((res, rej) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'ignore' });
    let out = '';
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.on('close', (code) => (code === 0 ? res(out) : rej(new Error(`${cmd} ${args.join(' ')} -> ${code}`))));
  });

const ensureEnvFile = () => {
  try {
    readFileSync(envPath, 'utf8');
  } catch {
    writeFileSync(envPath, readFileSync(resolve(root, '.env.example'), 'utf8'));
    log('created .env from .env.example');
  }
};

const setEnv = (key: string, value: string) => {
  const cur = readFileSync(envPath, 'utf8');
  const line = `${key}=${value}`;
  if (cur.match(new RegExp(`^${key}=`, 'm'))) {
    return writeFileSync(envPath, cur.replace(new RegExp(`^${key}=.*$`, 'm'), line));
  }
  writeFileSync(envPath, cur + (cur.endsWith('\n') ? '' : '\n') + line + '\n');
};

const deployContract = async (wasmPath: string, alias: string) => {
  const out = await run('stellar', ['contract', 'deploy', '--wasm', wasmPath, '--alias', alias]);
  const m = out.match(/C[A-Z0-9]{55}/);
  if (!m) throw new Error(`could not parse contract id from output: ${out}`);
  return m[0];
};

const main = async () => {
  ensureEnvFile();
  log('compiling contracts');
  await run('cargo', ['build', '--target', 'wasm32-unknown-unknown', '--release']);

  log('deploying bridge');
  const bridgeId = await deployContract(
    resolve(root, 'contracts/bridge/target/wasm32-unknown-unknown/release/bridge.wasm'),
    'stellar_payment_gateway_bridge',
  );
  setEnv('BRIDGE_CONTRACT_ID', bridgeId);
  setEnv('NEXT_PUBLIC_BRIDGE_CONTRACT_ID', bridgeId);

  log('deploying wrapper-token template');
  const wrapperTokenId = await deployContract(
    resolve(root, 'contracts/wrapper-token/target/wasm32-unknown-unknown/release/wrapper_token.wasm'),
    'stellar_payment_gateway_wrapper_token_template',
  );
  setEnv('WRAPPER_TOKEN_TEMPLATE_ID', wrapperTokenId);

  log('deploying factory');
  const factoryId = await deployContract(
    resolve(root, 'contracts/factory/target/wasm32-unknown-unknown/release/factory.wasm'),
    'stellar_payment_gateway_factory',
  );
  setEnv('FACTORY_CONTRACT_ID', factoryId);
  setEnv('NEXT_PUBLIC_FACTORY_CONTRACT_ID', factoryId);

  log('done — contract ids written to .env');
  log({ bridgeId, wrapperTokenId, factoryId });
};

main().catch((err) => {
  error(err.message ?? err);
  process.exit(1);
});
