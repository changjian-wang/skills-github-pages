import { useSyncExternalStore } from 'react'
import { readTasks, sampleTasks, saveTasks, STORAGE_KEY, type Task } from './tasks'

type Snapshot = { tasks: Task[]; blocked: string | null }
const listeners = new Set<() => void>()

function initialize(): Snapshot {
  try {
    const saved = readTasks(window.localStorage)
    const tasks = saved ?? sampleTasks()
    if (saved === null) saveTasks(window.localStorage, tasks)
    return { tasks, blocked: null }
  } catch {
    return { tasks: [], blocked: '本机数据无法读取或保存，原始数据未被覆盖。请先导出备份，再重置数据。' }
  }
}

let snapshot = initialize()

function publish(next: Snapshot) {
  snapshot = next
  listeners.forEach(listener => listener())
}

function storageChanged(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return
  try {
    publish({ tasks: readTasks(window.localStorage) ?? [], blocked: null })
  } catch {
    publish({ ...snapshot, blocked: '其他标签页中的数据无法读取，当前内容已保留。' })
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) window.addEventListener('storage', storageChanged)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', storageChanged)
  }
}

function changeTasks(update: (tasks: Task[]) => Task[]): string | null {
  if (snapshot.blocked) return snapshot.blocked
  try {
    const next = update(snapshot.tasks)
    saveTasks(window.localStorage, next)
    publish({ tasks: next, blocked: null })
    return null
  } catch (error) {
    if (error instanceof Error && error.name === 'TaskConflict') return error.message
    return '保存失败，修改未生效。请检查浏览器存储权限或剩余空间，并导出备份。'
  }
}

function resetTasks(): string | null {
  try {
    saveTasks(window.localStorage, [])
    publish({ tasks: [], blocked: null })
    return null
  } catch {
    return '重置失败。浏览器可能禁止了本地存储。'
  }
}

export function useTaskStore() {
  const current = useSyncExternalStore(subscribe, () => snapshot)
  return { ...current, changeTasks, resetTasks }
}