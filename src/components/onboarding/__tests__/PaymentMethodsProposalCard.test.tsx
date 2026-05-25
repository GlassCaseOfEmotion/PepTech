import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { PaymentMethodsProposalCard } from '../PaymentMethodsProposalCard'
import type { PaymentMethodsCommitInput } from '@/lib/payments/onboarding/types'
import type { PaymentType } from '@/types/payments'

const ALL_INITIAL = {
  managed_crypto: true,
  byo_crypto_assets: ['btc', 'eth'] as PaymentType[],
  off_platform_methods: ['cashapp', 'cash'] as PaymentType[],
}

describe('PaymentMethodsProposalCard', () => {
  it('renders all three sections when all categories are present', () => {
    render(
      <PaymentMethodsProposalCard
        initial={{ ...ALL_INITIAL }}
        onSave={vi.fn()}
        status="idle"
      />
    )
    expect(screen.getByText(/managed crypto/i)).toBeInTheDocument()
    expect(screen.getByText(/bring your own wallets/i)).toBeInTheDocument()
    expect(screen.getByText(/off-platform methods/i)).toBeInTheDocument()
  })

  it('renders only off-platform section when managed_crypto=false and byo is empty', () => {
    render(
      <PaymentMethodsProposalCard
        initial={{ managed_crypto: false, byo_crypto_assets: [], off_platform_methods: ['cash'] }}
        onSave={vi.fn()}
        status="idle"
      />
    )
    expect(screen.queryByText(/managed crypto/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/bring your own wallets/i)).not.toBeInTheDocument()
    expect(screen.getByText(/off-platform methods/i)).toBeInTheDocument()
  })

  it('disables save button when a BYO address is empty', () => {
    render(
      <PaymentMethodsProposalCard
        initial={{ managed_crypto: false, byo_crypto_assets: ['btc'], off_platform_methods: [] }}
        onSave={vi.fn()}
        status="idle"
      />
    )
    const saveBtn = screen.getByRole('button', { name: /save methods/i })
    expect(saveBtn).toBeDisabled()
  })

  it('disables save button when off-platform instructions are empty', () => {
    render(
      <PaymentMethodsProposalCard
        initial={{ managed_crypto: false, byo_crypto_assets: [], off_platform_methods: ['cashapp'] }}
        onSave={vi.fn()}
        status="idle"
      />
    )
    const saveBtn = screen.getByRole('button', { name: /save methods/i })
    expect(saveBtn).toBeDisabled()
  })

  it('disables save button when instructions contain only whitespace', async () => {
    const user = userEvent.setup()
    render(
      <PaymentMethodsProposalCard
        initial={{ managed_crypto: false, byo_crypto_assets: [], off_platform_methods: ['cashapp'] }}
        onSave={vi.fn()}
        status="idle"
      />
    )
    const textarea = screen.getByRole('textbox', { name: /cash app instructions/i })
    await user.type(textarea, '   ')
    const saveBtn = screen.getByRole('button', { name: /save methods/i })
    expect(saveBtn).toBeDisabled()
  })

  it('calls onSave with the correct PaymentMethodsCommitInput shape', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn() as ReturnType<typeof vi.fn<(input: PaymentMethodsCommitInput) => void>>

    render(
      <PaymentMethodsProposalCard
        initial={{ managed_crypto: false, byo_crypto_assets: ['eth'], off_platform_methods: ['cashapp'] }}
        onSave={onSave}
        status="idle"
      />
    )

    const ethInput = screen.getByRole('textbox', { name: /eth wallet address/i })
    // Valid ETH address (42 hex chars)
    await user.type(ethInput, '0xabcdef1234567890abcdef1234567890abcdef12')

    const cashappTextarea = screen.getByRole('textbox', { name: /cash app instructions/i })
    await user.type(cashappTextarea, '$MyHandle')

    const saveBtn = screen.getByRole('button', { name: /save methods/i })
    expect(saveBtn).not.toBeDisabled()
    await user.click(saveBtn)

    expect(onSave).toHaveBeenCalledOnce()
    const arg = onSave.mock.calls[0][0] as PaymentMethodsCommitInput
    expect(arg.managed_crypto).toBe(false)
    expect(arg.byo_crypto).toHaveLength(1)
    expect(arg.byo_crypto[0]).toMatchObject({ type: 'eth', wallet_address: '0xabcdef1234567890abcdef1234567890abcdef12' })
    expect(arg.off_platform).toHaveLength(1)
    expect(arg.off_platform[0]).toMatchObject({ type: 'cashapp', instructions: '$MyHandle' })
  })

  it('shows validation error after blur when an invalid BTC address is pasted', async () => {
    const user = userEvent.setup()
    render(
      <PaymentMethodsProposalCard
        initial={{ managed_crypto: false, byo_crypto_assets: ['btc'], off_platform_methods: [] }}
        onSave={vi.fn()}
        status="idle"
      />
    )

    const btcInput = screen.getByRole('textbox', { name: /btc wallet address/i })
    await user.type(btcInput, 'not-a-valid-btc-address')
    await user.tab() // trigger blur

    expect(screen.getByText(/doesn't look like a valid btc address/i)).toBeInTheDocument()
  })
})
