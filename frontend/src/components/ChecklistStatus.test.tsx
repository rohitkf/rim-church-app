import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge, SegmentedProgressBar } from './ChecklistStatus'

describe('StatusBadge', () => {
  it.each([
    ['pending', 'Pending'],
    ['member_complete', 'Member Complete'],
    ['head_verified', 'Head Verified'],
    ['coordinator_verified', 'Coordinator Verified'],
  ] as const)('renders the label for status %s', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe('SegmentedProgressBar', () => {
  it('computes 0% for everything when total is 0 (no divide-by-zero NaN%)', () => {
    render(
      <SegmentedProgressBar total={0} memberComplete={0} headVerified={0} coordinatorVerified={0} />,
    )
    // All three segments (Verified/Checked/Pending) should read 0%, not NaN%.
    expect(screen.getAllByText('0%')).toHaveLength(3)
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })

  it('computes correct percentages for a mixed batch', () => {
    render(
      <SegmentedProgressBar total={10} memberComplete={2} headVerified={3} coordinatorVerified={5} />,
    )
    // coordinatorVerified 5/10 = 50% "Verified"
    expect(screen.getByText('50%')).toBeInTheDocument()
    // headVerified 3/10 = 30% "Checked"
    expect(screen.getByText('30%')).toBeInTheDocument()
    // pending = 10 - 2 - 3 - 5 = 0 -> 0% "Pending"
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('treats items with no verification progress as fully pending', () => {
    render(
      <SegmentedProgressBar total={4} memberComplete={0} headVerified={0} coordinatorVerified={0} />,
    )
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})
