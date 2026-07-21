/**
 * Form validation utilities using react-hook-form + zod.
 *
 * Provides reusable form hooks for the StellarDAO dashboard:
 *   • useWrapForm — wrap token form
 *   • useVoteForm  — governance vote form
 *   • useCreateAssetForm — create asset form
 *
 * Each hook returns typed form state, validation errors, and
 * submit handlers that integrate with the API layer.
 */

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// ── Wrap Form ────────────────────────────────────────────────

export const WrapFormSchema = z.object({
  sourceChain: z.enum(['ethereum', 'solana', 'polygon'], {
    required_error: 'Select a source chain',
  }),
  sourceToken: z.string().min(1, 'Token address is required'),
  amount: z
    .string()
    .min(1, 'Amount is required')
    .regex(/^[0-9]+$/, 'Amount must be a whole number'),
  recipient: z.string().min(1, 'Recipient address is required'),
});

export type WrapFormValues = z.infer<typeof WrapFormSchema>;

export function useWrapForm() {
  return useForm<WrapFormValues>({
    resolver: zodResolver(WrapFormSchema),
    defaultValues: {
      sourceChain: 'ethereum',
      sourceToken: '',
      amount: '',
      recipient: '',
    },
  });
}

// ── Vote Form ────────────────────────────────────────────────

export const VoteFormSchema = z.object({
  voter: z
    .string()
    .min(1, 'Voter address is required')
    .regex(/^G[A-Z0-9]{55}$/, 'Must be a valid Stellar address (starts with G)'),
  voteType: z.enum(['for', 'against', 'abstain'], {
    required_error: 'Select a vote option',
  }),
});

export type VoteFormValues = z.infer<typeof VoteFormSchema>;

export function useVoteForm() {
  return useForm<VoteFormValues>({
    resolver: zodResolver(VoteFormSchema),
    defaultValues: {
      voter: '',
      voteType: 'for',
    },
  });
}

// ── Create Asset Form ────────────────────────────────────────

export const CreateAssetFormSchema = z.object({
  chain: z.enum(['ethereum', 'solana', 'polygon']),
  address: z
    .string()
    .min(1, 'Contract address is required')
    .regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a valid EVM address'),
  name: z.string().min(1, 'Token name is required').max(64),
  symbol: z.string().min(1, 'Token symbol is required').max(12),
  decimals: z.number().int().min(0).max(18),
  developerPublicKey: z
    .string()
    .min(1, 'Developer public key is required')
    .regex(/^G[A-Z0-9]{55}$/, 'Must be a valid Stellar address'),
});

export type CreateAssetFormValues = z.infer<typeof CreateAssetFormSchema>;

export function useCreateAssetForm() {
  return useForm<CreateAssetFormValues>({
    resolver: zodResolver(CreateAssetFormSchema),
    defaultValues: {
      chain: 'ethereum',
      address: '',
      name: '',
      symbol: '',
      decimals: 18,
      developerPublicKey: '',
    },
  });
}
