import type { OpenTask } from '@reflect/core'

const PUNCTUATION_RE = /[\p{P}\p{S}]/gu

function normalizedBreadcrumb(text: string): string {
  return text.replace(/\s+/g, '').replace(PUNCTUATION_RE, '')
}

/** Trim breadcrumb labels and hide a lone generic Tasks/Todo parent. */
export function visibleTaskBreadcrumbs(breadcrumbs: readonly string[]): string[] {
  const visible = breadcrumbs.map((text) => text.trim()).filter((text) => text.length > 0)
  if (visible.length !== 1) {
    return visible
  }
  return /^(?:task|todo)s?$/i.test(normalizedBreadcrumb(visible[0]!)) ? [] : visible
}

/** One consecutive run of task rows sharing the same parent outline labels. */
export interface TaskContext {
  readonly breadcrumbs: readonly string[]
  readonly tasks: readonly OpenTask[]
}

function haveSameBreadcrumbs(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index])
}

/** Group consecutive task rows that share the same parent outline context. */
export function groupTaskContexts(tasks: readonly OpenTask[]): TaskContext[] {
  const contexts: { breadcrumbs: readonly string[]; tasks: OpenTask[] }[] = []

  for (const task of tasks) {
    const previous = contexts.at(-1)
    if (previous !== undefined && haveSameBreadcrumbs(previous.breadcrumbs, task.breadcrumbs)) {
      previous.tasks.push(task)
    } else {
      contexts.push({ breadcrumbs: task.breadcrumbs, tasks: [task] })
    }
  }

  return contexts
}
