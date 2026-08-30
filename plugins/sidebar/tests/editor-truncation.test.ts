import { describe, expect, it } from 'vitest'
import { savedDocumentIsCurrent, textEditorCanSave, textEditorPolicy } from '../src/client/editor-load.ts'

describe('truncated text editor policy', () => {
  it('keeps a truncated prefix loaded but never editable', () => {
    expect(textEditorPolicy('prefix', true)).toEqual({ loaded: true, editable: false })
    expect(textEditorPolicy('complete', false)).toEqual({ loaded: true, editable: true })
    expect(textEditorPolicy(undefined, false)).toEqual({ loaded: false, editable: false })
  })

  it('blocks every save path when the current render is not editable', () => {
    expect(textEditorCanSave({ hasView: true, saving: false, editable: false })).toBe(false)
    expect(textEditorCanSave({ hasView: true, saving: false, editable: true })).toBe(true)
    expect(textEditorCanSave({ hasView: false, saving: false, editable: true })).toBe(false)
    expect(textEditorCanSave({ hasView: true, saving: true, editable: true })).toBe(false)
  })

  it('clears dirty state only when the saved document is still current', () => {
    expect(savedDocumentIsCurrent('submitted', 'submitted')).toBe(true)
    expect(savedDocumentIsCurrent('submitted', 'newer edit')).toBe(false)
    expect(savedDocumentIsCurrent('submitted', undefined)).toBe(false)
  })
})
