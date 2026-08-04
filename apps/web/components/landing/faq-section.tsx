'use client';

import { useState } from 'react';

interface FaqItem {
  question: string;
  answer: string;
}

const faqItems: FaqItem[] = [
  {
    question: 'What is Stellar Payment Gateway?',
    answer:
      'Stellar Payment Gateway is a cross-chain wrapping middleware that lets developers spin up wrapped versions of their Ethereum (ERC-20), Solana (SPL), or Polygon tokens on Stellar. It uses Soroban smart contracts, a multi-sig relayer network, and real-time Horizon event streaming to deliver settlements in under 5 seconds.',
  },
  {
    question: 'How does the bridge secure my tokens?',
    answer:
      'The bridge uses a threshold signature scheme — N-of-M relayer operators must attest to a Lock event before tokens are minted on Stellar. Nonces prevent replay attacks, and the bridge can be paused in emergencies. The verifier set is configurable by governance vote.',
  },
  {
    question: 'What does it cost to wrap a token?',
    answer:
      'Protocol fees start at 10 bps (0.10%) per wrap operation. Stellar gas fees are extremely low — a typical bridge mint costs ~0.003 XLM in gas. Polygon wraps receive a discounted rate of 5 bps. Fees are configurable via governance proposals.',
  },
  {
    question: 'Which wallets are supported?',
    answer:
      'Stellar Payment Gateway supports Freighter and Albedo browser extension wallets. A deterministic mock wallet is available for development. WalletConnect and hardware wallet support are on the roadmap.',
  },
  {
    question: 'Is Stellar Payment Gateway audited?',
    answer:
      'An external security audit is planned for the v1.0 mainnet release. The current testnet deployment includes internal security review covering signature verification, nonce replay protection, front-running resistance, and admin key management. See docs/SECURITY.md for the full threat model.',
  },
  {
    question: 'How does governance work?',
    answer:
      'Stellar Payment Gateway uses on-chain governance with a SEP-41 governance token featuring delegation and checkpointing. Proposals are created, voted on, and executed through a timelock controller that enforces a configurable delay (minimum 24h on mainnet) for all administrative actions.',
  },
  {
    question: 'Can I run my own relayer?',
    answer:
      'Yes! The relayer is open-source and can be run independently. To participate as a verifier, your public key must be added to the bridge contract\'s verifier set. The relayer watches Ethereum, Solana, and Polygon for Lock events and submits signed attestations.',
  },
  {
    question: 'What chains are supported?',
    answer:
      'Currently Ethereum, Solana, and Polygon are supported as source chains. Additional chains (Avalanche, Arbitrum, Optimism, Base) are on the roadmap. The relayer architecture is chain-agnostic — adding a new chain requires implementing a source adapter.',
  },
];

function FaqAccordionItem({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 py-5 text-left transition hover:text-white"
      >
        <span className={`text-sm font-medium transition ${isOpen ? 'text-white' : 'text-stellar-haze'}`}>
          {item.question}
        </span>
        <span
          className={`flex-shrink-0 text-lg transition-transform duration-200 ${
            isOpen ? 'rotate-45 text-stellar-nova' : 'text-stellar-haze/50'
          }`}
        >
          +
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-96 pb-5' : 'max-h-0'
        }`}
      >
        <p className="text-sm leading-relaxed text-stellar-haze">{item.answer}</p>
      </div>
    </div>
  );
}

interface Props {
  className?: string;
}

/**
 * Expandable FAQ accordion section for the landing page.
 *
 * Covers common questions about the protocol, security, fees,
 * wallets, governance, and supported chains.
 */
export function FaqSection({ className = '' }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className={className}>
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">Frequently asked questions</h2>
        <p className="mt-3 text-sm text-stellar-haze">
          Everything you need to know about cross-chain wrapping on Stellar Payment Gateway.
        </p>
      </div>
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/5 bg-white/[0.02] px-6">
        {faqItems.map((item, index) => (
          <FaqAccordionItem
            key={item.question}
            item={item}
            isOpen={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? null : index)}
          />
        ))}
      </div>
    </section>
  );
}
