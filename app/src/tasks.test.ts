import { describe, expect, it } from 'vitest'
import { defaultFilters, editTask, isOverdue, mergeTasks, newTask, parseTasks, queryTasks, readTasks, removeTasks, sampleTasks, saveTasks, serializeTasks, STORAGE_KEY, type TaskDraft } from './tasks'

const draft: TaskDraft = {
  title: 'A real task title', description: 'Task details', status: 'todo', priority: 'medium', project: 'personal', dueDate: '2026-09-20', tags: ['test'],
}

describe('task lifecycle', () => {
  it('creates and updates a task without mutating its original identity', () => {
    const task = newTask(draft)
    const edited = editTask(task, { ...draft, title: 'Updated title', status: 'done' })
    expect(edited.id).toBe(task.id)
    expect(edited.createdAt).toBe(task.createdAt)
    expect(edited.title).toBe('Updated title')
    expect(task.title).toBe(draft.title)
    expect(removeTasks([task], new Set([task.id]))).toEqual([])
  })

  it.each(['', '   '])('rejects an empty title: %j', title => {
    expect(() => newTask({ ...draft, title })).toThrow()
  })

  it.each(['2026-02-30', 'YYYY-MM-DD', '2026-13-01'])('rejects an invalid date: %s', dueDate => {
    expect(() => newTask({ ...draft, dueDate })).toThrow()
  })

  it('accepts no deadline and a valid leap day', () => {
    expect(newTask({ ...draft, dueDate: '' }).dueDate).toBe('')
    expect(newTask({ ...draft, dueDate: '2028-02-29' }).dueDate).toBe('2028-02-29')
  })
})

describe('persistent data and import', () => {
  it('roundtrips all fields including Unicode and multiline text', () => {
    const task = newTask({ ...draft, title: '中文任务', description: 'First line\n第二行', tags: ['阅读'] })
    expect(parseTasks(serializeTasks([task]))).toEqual([task])
  })

  it('distinguishes empty storage from a saved empty workspace', () => {
    expect(readTasks({ getItem: () => null })).toBeNull()
    expect(readTasks({ getItem: () => serializeTasks([]) })).toEqual([])
  })

  it('does not silently replace corrupt or unsupported data', () => {
    expect(() => readTasks({ getItem: () => '{broken' })).toThrow()
    expect(() => parseTasks('{"version":2,"tasks":[]}')).toThrow()
    expect(() => parseTasks('{"version":1,"tasks":[{"title":"missing fields"}]}')).toThrow()
  })

  it('rejects duplicate IDs in an import', () => {
    const task = newTask(draft)
    expect(() => parseTasks(JSON.stringify({ version: 1, tasks: [task, task] }))).toThrow()
  })

  it('surfaces write failures instead of reporting a successful save', () => {
    expect(() => saveTasks({ setItem: () => { throw new Error('Quota exceeded') } }, [])).toThrow('Quota exceeded')
    const entries = new Map<string, string>()
    saveTasks({ setItem: (key, value) => { entries.set(key, value) } }, [])
    expect(entries.get(STORAGE_KEY)).toBe(serializeTasks([]))
  })

  it('merges matching IDs and preserves unrelated tasks', () => {
    const first = newTask(draft)
    const second = newTask({ ...draft, title: 'Second task' })
    const updated = editTask(first, { ...draft, title: 'Imported update' })
    expect(mergeTasks([first, second], [updated])).toEqual([updated, second])
  })
})

describe('queries', () => {
  const tasks = sampleTasks(new Date('2026-09-20T12:00:00Z'))

  it('combines text, project, priority and status filters', () => {
    const results = queryTasks(tasks, { ...defaultFilters, search: 'react', project: 'engineering', priority: 'high', status: 'doing' })
    expect(results.map(task => task.id)).toEqual(['sample-react', 'sample-deploy'])
    expect(queryTasks(tasks, { ...defaultFilters, search: 'react', status: 'done' })).toEqual([])
  })

  it('excludes completed tasks from overdue and today views', () => {
    expect(queryTasks(tasks, { ...defaultFilters, scope: 'overdue' }, '2026-09-20').map(task => task.id)).toEqual(['sample-links'])
    expect(queryTasks(tasks, { ...defaultFilters, scope: 'today' }, '2026-09-20')).toHaveLength(2)
    expect(isOverdue(tasks[0], '2026-09-20')).toBe(false)
  })

  it('sorts tasks without a deadline last and does not reorder the source', () => {
    const originalOrder = tasks.map(task => task.id)
    const sorted = queryTasks(tasks, { ...defaultFilters, sort: 'due' })
    expect(sorted.at(-1)?.dueDate).toBe('')
    expect(tasks.map(task => task.id)).toEqual(originalOrder)
  })
})