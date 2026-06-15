import { useState, type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  errorMessage,
  hasBridge,
  listTaskGroups,
  toggleIndexedTask,
  type TaskListEntry,
} from '@reflect/core'
import { INDEX_QUERY_SCOPE, invalidateIndexQueries } from '@/lib/query-client'
import { startOperation } from '@/lib/operations'
import { todayIso } from '@/lib/dates'
import { useGraph } from '@/providers/graph-provider'
import { routeForPath } from '@/routing/route'
import { useRouter } from '@/routing/router'
import { TaskGroupSection } from './task-group-section'

function taskKey(task: TaskListEntry): string {
  return `${task.notePath}:${task.markerOffset}`
}

export function TasksScreen(): ReactElement {
  const { graph, indexGeneration } = useGraph()
  const { navigate } = useRouter()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const today = todayIso()
  const enabled = hasBridge() && graph !== null

  const { data: groups } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'tasks', today],
    queryFn: () => listTaskGroups(today),
    enabled,
  })

  async function toggleTask(task: TaskListEntry): Promise<void> {
    if (graph === null || indexGeneration === null) {
      return
    }
    const key = taskKey(task)
    setPendingKey(key)
    try {
      await toggleIndexedTask({
        notePath: task.notePath,
        markerOffset: task.markerOffset,
        raw: task.raw,
        graphGeneration: graph.generation,
        indexGeneration,
      })
      invalidateIndexQueries()
    } catch (cause) {
      startOperation('Updating task').fail(errorMessage(cause))
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <div aria-label="Tasks" className="flex h-full min-h-0 flex-col">
      <header className="flex flex-none items-center justify-between border-b border-border py-4 pl-4 pr-7 lg:pl-12">
        <h1 className="text-[15px] font-semibold text-text">Tasks</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-auto py-2">
        {(groups ?? []).map((group) => (
          <TaskGroupSection
            key={group.key}
            group={group}
            pendingKey={pendingKey}
            onOpen={(path) => navigate(routeForPath(path))}
            onToggle={(task) => void toggleTask(task)}
          />
        ))}
      </div>
    </div>
  )
}
