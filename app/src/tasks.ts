import { z } from 'zod'

export const STORAGE_KEY = 'taskline.workspace.v1'
export const MAX_TASKS = 2000
export const MAX_IMPORT_BYTES = 32 * 1024 * 1024
export const statuses = ['todo', 'doing', 'done'] as const
export const priorities = ['high', 'medium', 'low'] as const
export const projects = ['product', 'engineering', 'content', 'personal'] as const
export const statusLabels = { todo: '待处理', doing: '进行中', done: '已完成' }
export const priorityLabels = { high: '高优先级', medium: '中优先级', low: '低优先级' }
export const projectLabels = { product: '产品设计', engineering: '研发', content: '内容', personal: '个人' }

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function validDate(value: string) {
  if (value === '') return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00`)
  return !Number.isNaN(parsed.getTime()) && localDate(parsed) === value
}

export const draftSchema = z.object({
  title: z.string().trim().min(1, '请输入任务标题').max(120, '标题最多 120 个字符'),
  description: z.string().max(5000, '详情最多 5000 个字符'),
  status: z.enum(statuses),
  priority: z.enum(priorities),
  project: z.enum(projects),
  dueDate: z.string().refine(validDate, '截止日期无效'),
  tags: z.array(z.string().trim().min(1).max(20)).max(5, '最多 5 个标签'),
}).strict()

const taskSchema = draftSchema.extend({
  id: z.string().min(1).max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict()

const workspaceSchema = z.object({
  version: z.literal(1),
  tasks: z.array(taskSchema).max(MAX_TASKS),
}).strict().superRefine((workspace, context) => {
  if (new Set(workspace.tasks.map(task => task.id)).size !== workspace.tasks.length) {
    context.addIssue({ code: 'custom', message: '任务 ID 重复', path: ['tasks'] })
  }
})

export type Task = z.infer<typeof taskSchema>
export type TaskDraft = z.infer<typeof draftSchema>
export type Scope = 'all' | 'today' | 'overdue' | 'done' | 'todo'
export type Sort = 'updated' | 'due' | 'priority' | 'title'
export type Filters = {
  search: string
  scope: Scope
  status: Task['status'] | 'all'
  priority: Task['priority'] | 'all'
  project: Task['project'] | 'all'
  sort: Sort
}

export const defaultFilters: Filters = {
  search: '', scope: 'all', status: 'all', priority: 'all', project: 'all', sort: 'updated',
}

export function newTask(draft: TaskDraft): Task {
  const timestamp = new Date().toISOString()
  return taskSchema.parse({ ...draft, id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp })
}

export function editTask(task: Task, draft: TaskDraft): Task {
  return taskSchema.parse({ ...task, ...draft, id: task.id, createdAt: task.createdAt, updatedAt: new Date().toISOString() })
}

export function serializeTasks(tasks: Task[]) {
  return JSON.stringify(workspaceSchema.parse({ version: 1, tasks }), null, 2)
}

export function parseTasks(content: string): Task[] {
  return workspaceSchema.parse(JSON.parse(content)).tasks
}

export function readTasks(storage: Pick<Storage, 'getItem'>): Task[] | null {
  const content = storage.getItem(STORAGE_KEY)
  return content === null ? null : parseTasks(content)
}

export function saveTasks(storage: Pick<Storage, 'setItem'>, tasks: Task[]) {
  storage.setItem(STORAGE_KEY, serializeTasks(tasks))
}

export function mergeTasks(current: Task[], incoming: Task[]) {
  const merged = new Map(current.map(task => [task.id, task]))
  incoming.forEach(task => merged.set(task.id, task))
  return workspaceSchema.parse({ version: 1, tasks: [...merged.values()] }).tasks
}

export function removeTasks(tasks: Task[], ids: Set<string>) {
  return tasks.filter(task => !ids.has(task.id))
}

export function isOverdue(task: Task, today = localDate()) {
  return task.status !== 'done' && task.dueDate !== '' && task.dueDate < today
}

export function queryTasks(tasks: Task[], filters: Filters, today = localDate()) {
  const search = filters.search.trim().toLocaleLowerCase()
  const priorityOrder = { high: 0, medium: 1, low: 2 }
  return tasks.filter(task => {
    if (filters.scope === 'today' && (task.dueDate !== today || task.status === 'done')) return false
    if (filters.scope === 'overdue' && !isOverdue(task, today)) return false
    if (filters.scope === 'done' && task.status !== 'done') return false
    if (filters.scope === 'todo' && task.status !== 'todo') return false
    if (filters.status !== 'all' && task.status !== filters.status) return false
    if (filters.priority !== 'all' && task.priority !== filters.priority) return false
    if (filters.project !== 'all' && task.project !== filters.project) return false
    return !search || [task.title, task.description, ...task.tags, projectLabels[task.project]].join(' ').toLocaleLowerCase().includes(search)
  }).sort((first, second) => {
    if (filters.sort === 'due') return (first.dueDate || '9999-99-99').localeCompare(second.dueDate || '9999-99-99')
    if (filters.sort === 'priority') return priorityOrder[first.priority] - priorityOrder[second.priority]
    if (filters.sort === 'title') return first.title.localeCompare(second.title, 'zh-CN')
    return second.updatedAt.localeCompare(first.updatedAt)
  })
}

export function sampleTasks(today = new Date()): Task[] {
  const dateOffset = (days: number) => {
    const date = new Date(today)
    date.setDate(date.getDate() + days)
    return localDate(date)
  }
  const timestamp = today.toISOString()
  const samples: (TaskDraft & { id: string })[] = [
    { id: 'sample-navigation', title: '梳理个人站点导航', description: '确认首页、文章和任务管理台之间的导航入口。', status: 'done', priority: 'medium', project: 'product', dueDate: dateOffset(-1), tags: ['示例', '站点'] },
    { id: 'sample-react', title: '完成 React 管理台交互验收', description: '检查任务创建、编辑、删除与刷新后的数据保留。', status: 'doing', priority: 'high', project: 'engineering', dueDate: dateOffset(0), tags: ['示例', 'React'] },
    { id: 'sample-notes', title: '整理 DeepSeek 架构阅读笔记', description: '整理 MoE、MLA 与多 token 预测的关键区别。', status: 'todo', priority: 'medium', project: 'content', dueDate: dateOffset(1), tags: ['示例', '阅读'] },
    { id: 'sample-mobile', title: '检查博客手机端排版', description: '核对长标题、表格与导航在手机上的显示。', status: 'todo', priority: 'medium', project: 'product', dueDate: dateOffset(3), tags: ['示例', '体验'] },
    { id: 'sample-links', title: '整理草稿与参考链接', description: '移除不再使用的草稿，确认文章引用可以打开。', status: 'todo', priority: 'high', project: 'content', dueDate: dateOffset(-2), tags: ['示例'] },
    { id: 'sample-deploy', title: '复核自动发布工作流', description: '确认博客和 React 应用都包含在同一份发布产物中。', status: 'doing', priority: 'high', project: 'engineering', dueDate: dateOffset(0), tags: ['示例', '发布'] },
    { id: 'sample-summary', title: '写一篇本月学习总结', description: '记录已经掌握的知识，以及下个月想尝试的项目。', status: 'todo', priority: 'low', project: 'personal', dueDate: dateOffset(7), tags: ['示例', '学习'] },
    { id: 'sample-backup', title: '导出本周任务备份', description: '将任务导出为 JSON 文件，保存一份本机备份。', status: 'todo', priority: 'low', project: 'personal', dueDate: '', tags: ['示例'] },
  ]
  return samples.map(sample => taskSchema.parse({ ...sample, createdAt: timestamp, updatedAt: timestamp }))
}