import { describe, expect, it } from 'vitest'
import { gitEntryState } from '../src/client/git-entry-state.ts'

describe('gitEntryState', () => {
  it.each(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])('classifies %s as a conflict', (xy) => {
    expect(gitEntryState(xy)).toEqual({ tone: 'warning', label: 'conflict' })
  })

  it.each([' M', 'M ', 'A ', ' D', 'R ', '??'])('keeps %s as an ordinary change', (xy) => {
    expect(gitEntryState(xy)).toEqual({ tone: 'neutral', label: null })
  })
})
