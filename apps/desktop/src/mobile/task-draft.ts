import {
  clearTaskDueDate,
  normalizeWikiTarget,
  scanInlineWikiLinks,
  setTaskDueDate,
} from '@reflect/core'

/**
 * Draft-side due-date reads/writes for the mobile quick-edit sheet. The sheet
 * holds the task's content as an editable markdown draft, and scheduling edits
 * the draft rather than writing through — so text and date changes land as one
 * write when the sheet commits. The date rule is the projection's: a task's due
 * date is the first calendar-valid `[[YYYY-MM-DD]]` link in its content.
 */

/** The draft's due date — the first calendar-valid `[[YYYY-MM-DD]]` link, or null. */
export function draftDueDate(content: string): string | null {
  for (const link of scanInlineWikiLinks(content)) {
    const { date } = normalizeWikiTarget(link.target)
    if (date !== undefined) {
      return date
    }
  }
  return null
}

/** The draft with its due-date link set to `isoDate`, or removed when null. */
export function withDraftDueDate(content: string, isoDate: string | null): string {
  return isoDate === null ? clearTaskDueDate(content) : setTaskDueDate(content, isoDate)
}
