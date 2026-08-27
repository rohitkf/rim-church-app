import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChecklistStageBoxes } from './ChecklistStageBoxes'

const everyone = { member: true, head: true, sign: true }
const boxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[]

describe('ChecklistStageBoxes', () => {
  it('ticks the boxes up to the current stage', () => {
    render(<ChecklistStageBoxes status="head_verified" may={everyone} onChange={() => {}} />)
    expect(boxes().map((b) => b.checked)).toEqual([true, true, false])
  })

  it('only opens the frontier: the next stage, or the last one set', () => {
    render(<ChecklistStageBoxes status="member_complete" may={everyone} onChange={() => {}} />)
    // the volunteer's own tick can still be taken back, the head's is next,
    // and sign-off is out of reach until the head has verified
    expect(boxes().map((b) => b.disabled)).toEqual([false, false, true])
  })

  it('locks a stage once the one above it is signed', () => {
    render(<ChecklistStageBoxes status="head_verified" may={everyone} onChange={() => {}} />)
    const [member] = boxes()
    expect(member.disabled).toBe(true)
  })

  it('gives each box only to the person whose signature it is', () => {
    render(
      <ChecklistStageBoxes
        status="member_complete"
        may={{ member: false, head: true, sign: false }}
        onChange={() => {}}
      />,
    )
    const [member, head] = boxes()
    expect(member.disabled).toBe(true)
    expect(head.disabled).toBe(false)
  })

  it('moves the item forward when ticked and back when unticked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()

    const { rerender } = render(
      <ChecklistStageBoxes status="pending" may={everyone} onChange={onChange} />,
    )
    await user.click(boxes()[0])
    expect(onChange).toHaveBeenLastCalledWith('member_complete')

    rerender(<ChecklistStageBoxes status="member_complete" may={everyone} onChange={onChange} />)
    await user.click(boxes()[0])
    expect(onChange).toHaveBeenLastCalledWith('pending')

    rerender(<ChecklistStageBoxes status="coordinator_verified" may={everyone} onChange={onChange} />)
    await user.click(boxes()[2])
    expect(onChange).toHaveBeenLastCalledWith('head_verified')
  })

  it('goes inert while a change is in flight', () => {
    render(<ChecklistStageBoxes status="pending" may={everyone} onChange={() => {}} busy />)
    expect(boxes().every((b) => b.disabled)).toBe(true)
  })
})
