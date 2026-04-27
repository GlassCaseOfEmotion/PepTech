import { render, screen, fireEvent } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { Composer } from '../Composer'

describe('Composer', () => {
  it('send button is disabled when textarea is empty', () => {
    render(<Composer onSend={vi.fn()} channelType="telegram" customerName="Alice" quickReplies={[]} />)
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })

  it('send button is enabled when there is text', async () => {
    const user = userEvent.setup()
    render(<Composer onSend={vi.fn()} channelType="telegram" customerName="Alice" quickReplies={[]} />)
    await user.type(screen.getByRole('textbox'), 'hello')
    expect(screen.getByRole('button', { name: /send/i })).not.toBeDisabled()
  })

  it('calls onSend with text and clears textarea on submit', async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<Composer onSend={onSend} channelType="telegram" customerName="Alice" quickReplies={[]} />)
    const ta = screen.getByRole('textbox')
    await user.type(ta, 'hello')
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('hello')
    expect(ta).toHaveValue('')
  })

  it('inserts quick reply text on chip click', async () => {
    const user = userEvent.setup()
    render(
      <Composer
        onSend={vi.fn()}
        channelType="telegram"
        customerName="Alice"
        quickReplies={[{ id: 'q1', label: 'send wallet addr', content: 'USDT: addr123', sort_order: 0 }]}
      />
    )
    await user.click(screen.getByText('send wallet addr'))
    expect(screen.getByRole('textbox')).toHaveValue('USDT: addr123')
  })
})
