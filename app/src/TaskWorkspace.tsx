import { startTransition, useDeferredValue, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertCircle, ArrowDownToLine, ArrowLeft, ArrowUpFromLine, CalendarClock,
  CalendarDays, CheckCheck, CheckCircle2, ChevronLeft, ChevronRight, Circle,
  Clock3, Columns3, Flag, GripVertical, HardDrive, Inbox, LayoutList,
  ListTodo, Menu, Pencil, Plus, Search, Trash2, X,
} from 'lucide-react'
import {
  defaultFilters, editTask, isOverdue, localDate, MAX_IMPORT_BYTES, MAX_TASKS, mergeTasks,
  newTask, parseTasks, priorities, priorityLabels, projectLabels, projects,
  queryTasks, removeTasks, serializeTasks, statusLabels, statuses, STORAGE_KEY,
  type Filters, type Scope, type Task, type TaskDraft,
} from './tasks'
import { IconButton, Modal, TaskEditor, type Editor } from './TaskDialog'
import { useTaskStore } from './useTaskStore'

type Notice = { message: string; error?: boolean; undo?: () => void }
const scopeLabels: Record<Scope, string> = {
  all: '全部任务', today: '今日待办', overdue: '已逾期', done: '已完成', todo: '待处理',
}
const statusIcons = { todo: Circle, doing: Clock3, done: CheckCircle2 }

function Priority({ priority }: { priority: Task['priority'] }) {
  return <span className={`priority priority-${priority}`}><Flag size={13} />{priorityLabels[priority]}</span>
}

function DueDate({ task, today }: { task: Task; today: string }) {
  const label = task.dueDate === today ? '今天' : task.dueDate ? task.dueDate.replaceAll('-', '/') : '无截止日期'
  return <span className={`due-date ${isOverdue(task, today) ? 'overdue' : ''}`}><CalendarDays size={14} />{label}</span>
}

function StatusSelect({ task, onChange, disabled = false }: {
  task: Task
  onChange: (task: Task, status: Task['status']) => void
  disabled?: boolean
}) {
  return <select className={`status-select status-${task.status}`} disabled={disabled}
    aria-label={`状态：${task.title}`} value={task.status}
    onChange={event => onChange(task, event.target.value as Task['status'])}>
    {statuses.map(status => <option value={status} key={status}>{statusLabels[status]}</option>)}
  </select>
}

function updateStatus(task: Task, status: Task['status']) {
  return editTask(task, {
    title: task.title, description: task.description, status, priority: task.priority,
    project: task.project, dueDate: task.dueDate, tags: task.tags,
  })
}

function downloadText(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function TaskWorkspace() {
  const { tasks, blocked, changeTasks, resetTasks } = useTaskStore()
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [view, setView] = useState<'list' | 'board'>('list')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<Task[] | null>(null)
  const [pendingImport, setPendingImport] = useState<{ tasks: Task[]; filename: string } | null>(null)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [dragOver, setDragOver] = useState<Task['status'] | null>(null)
  const [today, setToday] = useState(localDate)
  const fileInput = useRef<HTMLInputElement>(null)
  const deferredSearch = useDeferredValue(filters.search)
  const filtered = queryTasks(tasks, { ...filters, search: deferredSearch }, today)
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(pageNumber, totalPages)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const selectedTasks = tasks.filter(task => selected.has(task.id))
  const detail = tasks.find(task => task.id === detailId)
  const completed = tasks.filter(task => task.status === 'done').length
  const todayTasks = tasks.filter(task => task.dueDate === today && task.status !== 'done').length
  const overdueTasks = tasks.filter(task => isOverdue(task, today)).length
  const completion = tasks.length ? Math.round(completed / tasks.length * 100) : 0
  const hasFilters = filters.search !== '' || filters.status !== 'all' || filters.priority !== 'all'
    || filters.project !== 'all' || filters.scope !== 'all'
  const heading = filters.project !== 'all' ? projectLabels[filters.project] : scopeLabels[filters.scope]

  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDate()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!notice || notice.error) return
    const timer = window.setTimeout(() => setNotice(null), 7000)
    return () => window.clearTimeout(timer)
  }, [notice])

  function updateFilters(patch: Partial<Filters>) {
    startTransition(() => setFilters(current => ({ ...current, ...patch })))
    setPageNumber(1)
    setSelected(new Set())
  }

  function commit(update: (current: Task[]) => Task[], message: string, undo?: () => void) {
    const error = changeTasks(update)
    setNotice(error ? { message: error, error: true } : { message, undo })
    return error
  }

  function saveDraft(draft: TaskDraft, original?: Task) {
    if (!original && tasks.length >= MAX_TASKS) return `最多保存 ${MAX_TASKS} 个任务，请先导出并整理。`
    return commit(current => {
      if (!original) return [newTask(draft), ...current]
      const latest = current.find(task => task.id === original.id)
      if (!latest || latest.updatedAt !== original.updatedAt) {
        const conflict = new Error('任务已被其他操作更新或删除，请关闭编辑器后重新打开。')
        conflict.name = 'TaskConflict'
        throw conflict
      }
      return current.map(task => task.id === original.id ? editTask(task, draft) : task)
    }, original ? '任务已更新' : '任务已创建')
  }

  function changeStatus(task: Task, status: Task['status']) {
    if (task.status === status) return
    commit(current => current.map(item => item.id === task.id ? updateStatus(item, status) : item),
      `已标记为${statusLabels[status]}`)
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const deleted = pendingDelete
    const ids = new Set(deleted.map(task => task.id))
    const error = commit(current => removeTasks(current, ids), `已删除 ${deleted.length} 个任务`, () => {
      commit(current => mergeTasks(deleted, current), '已撤销删除')
    })
    if (!error) { setPendingDelete(null); setSelected(new Set()) }
  }

  function toggleSelection(id: string) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      setNotice({ message: '导入文件不能超过 32 MB。', error: true })
      return
    }
    setImporting(true)
    try {
      const incoming = parseTasks(await file.text())
      setImportMode('merge')
      setImportError('')
      setPendingImport({ tasks: incoming, filename: file.name })
    } catch {
      setNotice({ message: '文件无效：请检查 JSON 版本、任务字段、日期或重复 ID。现有数据未修改。', error: true })
    } finally { setImporting(false) }
  }

  const navigation: { scope: Scope; icon: typeof Inbox; count: number }[] = [
    { scope: 'all', icon: ListTodo, count: tasks.length },
    { scope: 'today', icon: CalendarDays, count: todayTasks },
    { scope: 'todo', icon: Inbox, count: tasks.filter(task => task.status === 'todo').length },
    { scope: 'overdue', icon: CalendarClock, count: overdueTasks },
    { scope: 'done', icon: CheckCircle2, count: completed },
  ]

  const sidebarContent = <>
    <a className="brand" href={import.meta.env.BASE_URL}>
      <img src={`${import.meta.env.BASE_URL}app-icon.png`} width="34" height="34" alt="" />
      <span>TASKLINE<span className="brand-caption">个人工作区</span></span>
    </a>
    <div className="workspace-label">工作空间</div>
    <nav aria-label="任务视图">{navigation.map(({ scope, icon: Icon, count }) => (
      <button className={`nav-item ${filters.scope === scope && filters.project === 'all' ? 'active' : ''}`}
        key={scope} onClick={() => { updateFilters({ ...defaultFilters, scope }); setSidebarOpen(false) }}>
        <Icon size={18} /><span>{scopeLabels[scope]}</span><span className="nav-count">{count}</span>
      </button>
    ))}</nav>
    <div className="workspace-label project-heading">项目<span>{projects.length}</span></div>
    <nav aria-label="项目筛选">{projects.map(project => (
      <button className={`nav-item ${filters.project === project ? 'active' : ''}`} key={project}
        onClick={() => { updateFilters({ ...defaultFilters, project }); setSidebarOpen(false) }}>
        <span className={`project-dot project-${project}`} /><span>{projectLabels[project]}</span>
        <span className="nav-count">{tasks.filter(task => task.project === project).length}</span>
      </button>
    ))}</nav>
    <div className="sidebar-bottom">
      <div className="storage-label"><HardDrive size={15} /><span>本机数据</span><span className={`connection-dot ${blocked ? 'error' : ''}`} /></div>
      <a className="back-link" href="../"><ArrowLeft size={16} />返回博客</a>
      <div className="profile"><span className="avatar">ME</span><div><strong>我的工作区</strong><span>个人 · 本地存储</span></div></div>
    </div>
  </>

  return <div className="app-shell">
    <a className="skip-link" href="#workspace">跳到任务列表</a>
    <aside className="sidebar">{sidebarContent}</aside>
    {sidebarOpen && <Modal title="工作空间" onClose={() => setSidebarOpen(false)}><div className="mobile-sidebar">{sidebarContent}</div></Modal>}
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumbs"><span className="mobile-menu"><IconButton label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={20} /></IconButton></span><span>个人工作区</span><ChevronRight size={14} /><strong>任务管理</strong></div>
        <div className="topbar-right"><span className="today-label">{new Date(`${today}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span><span className="avatar small">ME</span></div>
      </header>
      <main id="workspace" className="main-content">
        <section className="page-heading">
          <div><div className="eyebrow">TASK OVERVIEW</div><h1>{heading}<span className="heading-count">{filtered.length}</span></h1></div>
          <button className="button primary new-task" disabled={!!blocked} onClick={() => setEditor({})}><Plus size={18} />新建任务</button>
        </section>
        {blocked && <div className="error-banner" role="alert">
          <AlertCircle size={20} /><p>{blocked}</p>
          <button className="button" onClick={() => {
            try { downloadText(window.localStorage.getItem(STORAGE_KEY) ?? '', `taskline-recovery-${today}.json`) }
            catch { setNotice({ message: '浏览器不允许读取本地数据。', error: true }) }
          }}>导出原始数据</button>
          <button className="button danger" onClick={() => setResetOpen(true)}>重置数据</button>
        </div>}
        <section className="stats-band" aria-label="任务统计">
          <button className="stat" onClick={() => updateFilters({ ...defaultFilters })}><span className="stat-label"><ListTodo size={16} />全部任务</span><strong>{tasks.length.toString().padStart(2, '0')}</strong><span className="stat-caption">{tasks.length - completed} 项尚未完成</span></button>
          <button className="stat" onClick={() => updateFilters({ ...defaultFilters, scope: 'today' })}><span className="stat-label"><CalendarDays size={16} />今日待办</span><strong>{todayTasks.toString().padStart(2, '0')}</strong><span className="stat-caption">截止日期为今天</span></button>
          <button className="stat" onClick={() => updateFilters({ ...defaultFilters, scope: 'overdue' })}><span className="stat-label"><CalendarClock size={16} />逾期任务</span><strong className={overdueTasks ? 'overdue' : ''}>{overdueTasks.toString().padStart(2, '0')}</strong><span className="stat-caption">{overdueTasks ? '等待重新安排' : '暂无逾期任务'}</span></button>
          <button className="stat completion-stat" onClick={() => updateFilters({ ...defaultFilters, scope: 'done' })}><span className="stat-label"><CheckCircle2 size={16} />完成进度</span><strong>{completion}<small>%</small></strong><div className="progress-track" role="progressbar" aria-label="任务完成率" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${completion}%` }} /></div></button>
        </section>
        <section className="task-workspace" aria-label="任务管理">
          <div className="view-toolbar">
            <div className="view-switch" role="group" aria-label="显示方式">
              <button aria-pressed={view === 'list'} className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}><LayoutList size={17} />列表</button>
              <button aria-pressed={view === 'board'} className={view === 'board' ? 'selected' : ''} onClick={() => setView('board')}><Columns3 size={17} />看板</button>
            </div>
            <div className="toolbar-actions">
              <span className="result-count">{filtered.length} 个任务</span>
              <IconButton label="导入 JSON" disabled={!!blocked || importing} onClick={() => fileInput.current?.click()}><ArrowUpFromLine size={18} /></IconButton>
              <IconButton label="导出 JSON" disabled={!!blocked} onClick={() => {
                downloadText(serializeTasks(tasks), `taskline-${today}.json`)
                setNotice({ message: '任务备份已导出' })
              }}><ArrowDownToLine size={18} /></IconButton>
              <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="导入任务文件" onChange={importFile} />
            </div>
          </div>
          <div className="filter-toolbar">
            <div className="search-box"><Search size={17} /><input aria-label="搜索任务" placeholder="搜索任务、详情或标签…"
              value={filters.search} onChange={event => {
                setFilters(current => ({ ...current, search: event.target.value }))
                setPageNumber(1)
                setSelected(new Set())
              }} />{filters.search && <IconButton label="清空搜索" onClick={() => updateFilters({ search: '' })}><X size={14} /></IconButton>}</div>
            <select aria-label="筛选状态" value={filters.status} onChange={event => updateFilters({ status: event.target.value as Filters['status'] })}>
              <option value="all">全部状态</option>{statuses.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </select>
            <select aria-label="筛选优先级" value={filters.priority} onChange={event => updateFilters({ priority: event.target.value as Filters['priority'] })}>
              <option value="all">全部优先级</option>{priorities.map(priority => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
            </select>
            <select className="sort-select" aria-label="排序方式" value={filters.sort} onChange={event => updateFilters({ sort: event.target.value as Filters['sort'] })}>
              <option value="updated">最近更新</option><option value="due">截止日期</option><option value="priority">优先级</option><option value="title">标题顺序</option>
            </select>
          </div>
          {selectedTasks.length > 0 && <div className="selection-toolbar">
            <span>已选择 <strong>{selectedTasks.length}</strong> 项</span>
            <button className="text-button" disabled={!!blocked} onClick={() => {
              if (!commit(current => current.map(task => selected.has(task.id) ? updateStatus(task, 'done') : task), '所选任务已完成')) setSelected(new Set())
            }}><CheckCheck size={16} />标记完成</button>
            <button className="text-button danger-text" disabled={!!blocked} onClick={() => setPendingDelete(selectedTasks)}><Trash2 size={16} />删除</button>
            <IconButton label="取消选择" onClick={() => setSelected(new Set())}><X size={16} /></IconButton>
          </div>}
          {filtered.length === 0 ? <div className="empty-state">
            <Inbox size={38} strokeWidth={1.4} /><h2>{hasFilters ? '没有匹配的任务' : '还没有任务'}</h2>
            <button className="button" onClick={() => hasFilters ? updateFilters(defaultFilters) : setEditor({})} disabled={!hasFilters && !!blocked}>
              {hasFilters ? <X size={16} /> : <Plus size={16} />}{hasFilters ? '清除筛选' : '创建第一项任务'}
            </button>
          </div> : view === 'list' ? <>
            <div className="list-heading">
              <input type="checkbox" aria-label="选择本页全部任务"
                checked={visible.length > 0 && visible.every(task => selected.has(task.id))}
                ref={element => { if (element) element.indeterminate = visible.some(task => selected.has(task.id)) && !visible.every(task => selected.has(task.id)) }}
                onChange={event => setSelected(current => {
                  const next = new Set(current)
                  visible.forEach(task => event.target.checked ? next.add(task.id) : next.delete(task.id))
                  return next
                })} />
              <span>任务名称</span><span>状态</span><span className="column-project">项目</span><span>截止日期</span><span className="column-priority">优先级</span><span className="sr-only">操作</span>
            </div>
            <ul className="task-list">{visible.map(task => <li key={task.id} className={`task-row ${selected.has(task.id) ? 'row-selected' : ''}`}>
              <input type="checkbox" aria-label={`选择：${task.title}`} checked={selected.has(task.id)} onChange={() => toggleSelection(task.id)} />
              <div className="task-title-cell">
                <button className={`task-title ${task.status === 'done' ? 'completed-title' : ''}`} onClick={() => setDetailId(task.id)}>{task.title}</button>
                <div className="task-subline">{task.tags.slice(0, 2).map(tag => <span key={tag} className="tag">{tag}</span>)}<span className="mobile-due"><DueDate task={task} today={today} /></span></div>
              </div>
              <div className="row-status"><StatusSelect task={task} onChange={changeStatus} disabled={!!blocked} /></div>
              <span className="row-project"><span className={`project-dot project-${task.project}`} />{projectLabels[task.project]}</span>
              <span className="row-due"><DueDate task={task} today={today} /></span>
              <span className="row-priority"><Priority priority={task.priority} /></span>
              <div className="row-actions">
                <IconButton label={`编辑：${task.title}`} disabled={!!blocked} onClick={() => setEditor({ task })}><Pencil size={15} /></IconButton>
                <IconButton label={`删除：${task.title}`} disabled={!!blocked} onClick={() => setPendingDelete([task])}><Trash2 size={15} /></IconButton>
              </div>
            </li>)}</ul>
            <div className="pagination"><span>第 {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} 项，共 {filtered.length} 项</span><div>
              <select aria-label="每页任务数" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPageNumber(1) }}>
                {[10, 20, 50].map(size => <option key={size} value={size}>{size} 项 / 页</option>)}
              </select>
              <IconButton label="上一页" disabled={currentPage <= 1} onClick={() => setPageNumber(currentPage - 1)}><ChevronLeft size={18} /></IconButton>
              <span className="page-number">{currentPage} / {totalPages}</span>
              <IconButton label="下一页" disabled={currentPage >= totalPages} onClick={() => setPageNumber(currentPage + 1)}><ChevronRight size={18} /></IconButton>
            </div></div>
          </> : <div className="board">{statuses.map(status => {
            const columnTasks = filtered.filter(task => task.status === status)
            const StatusIcon = statusIcons[status]
            return <section key={status} aria-label={`${statusLabels[status]}看板`}
              className={`board-column ${dragOver === status ? 'drag-over' : ''}`}
              onDragOver={event => { event.preventDefault(); setDragOver(status) }}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(null) }}
              onDrop={event => {
                event.preventDefault()
                setDragOver(null)
                const task = tasks.find(item => item.id === event.dataTransfer.getData('text/plain'))
                if (task && !blocked) changeStatus(task, status)
              }}>
              <div className={`column-heading status-${status}`}><StatusIcon size={17} /><h2>{statusLabels[status]}</h2><span>{columnTasks.length}</span>
                <IconButton label={`新增${statusLabels[status]}任务`} disabled={!!blocked} onClick={() => setEditor({ status })}><Plus size={17} /></IconButton>
              </div>
              <div className="column-tasks">{columnTasks.map(task => <article key={task.id}
                className={`task-card ${task.status === 'done' ? 'done-card' : ''}`} draggable={!blocked}
                onDragStart={event => { event.dataTransfer.setData('text/plain', task.id); event.dataTransfer.effectAllowed = 'move' }}
                onDragEnd={() => setDragOver(null)}>
                <div className="card-topline"><Priority priority={task.priority} /><div><GripVertical className="drag-handle" size={15} aria-hidden="true" />
                  <IconButton label={`编辑：${task.title}`} disabled={!!blocked} onClick={() => setEditor({ task })}><Pencil size={15} /></IconButton>
                  <IconButton label={`删除：${task.title}`} disabled={!!blocked} onClick={() => setPendingDelete([task])}><Trash2 size={15} /></IconButton>
                </div></div>
                <button className="task-title card-title" onClick={() => setDetailId(task.id)}>{task.title}</button>
                {task.description && <p className="card-description">{task.description}</p>}
                <div className="card-tags">{task.tags.slice(0, 3).map(tag => <span className="tag" key={tag}>{tag}</span>)}</div>
                <div className="card-project"><span className={`project-dot project-${task.project}`} />{projectLabels[task.project]}</div>
                <div className="card-footer"><DueDate task={task} today={today} /><StatusSelect task={task} onChange={changeStatus} disabled={!!blocked} /></div>
              </article>)}{columnTasks.length === 0 && <div className="empty-column">暂无任务</div>}</div>
            </section>
          })}</div>}
        </section>
        <footer className="workspace-footer"><span><span className="connection-dot" />个人工作区 · 本机存储</span><span>TASKLINE / {new Date().getFullYear()}</span></footer>
      </main>
    </div>
    {editor && <TaskEditor editor={editor} onClose={() => setEditor(null)} onSave={saveDraft} />}
    {detail && <Modal title="任务详情" onClose={() => setDetailId(null)} drawer>
      <div className="detail-body"><span className="eyebrow">TASK DETAILS</span><h3>{detail.title}</h3>
        <div className="detail-badges"><StatusSelect task={detail} onChange={changeStatus} disabled={!!blocked} /><Priority priority={detail.priority} /></div>
        <dl><div><dt>所属项目</dt><dd><span className={`project-dot project-${detail.project}`} />{projectLabels[detail.project]}</dd></div>
          <div><dt>截止日期</dt><dd><DueDate task={detail} today={today} /></dd></div>
          <div><dt>标签</dt><dd>{detail.tags.length ? detail.tags.map(tag => <span className="tag" key={tag}>{tag}</span>) : '无'}</dd></div>
        </dl>
        <h4>任务详情</h4><p className="detail-description">{detail.description || '暂无详情'}</p>
        <div className="detail-timestamps"><p>创建于 {new Date(detail.createdAt).toLocaleString('zh-CN')}</p><p>更新于 {new Date(detail.updatedAt).toLocaleString('zh-CN')}</p></div>
      </div>
      <footer className="form-footer"><button className="button danger" disabled={!!blocked} onClick={() => { setDetailId(null); setPendingDelete([detail]) }}><Trash2 size={16} />删除任务</button><button className="button primary" disabled={!!blocked} onClick={() => { setDetailId(null); setEditor({ task: detail }) }}><Pencil size={16} />编辑任务</button></footer>
    </Modal>}
    {pendingDelete && <Modal title="删除任务" onClose={() => setPendingDelete(null)}>
      <div className="confirmation-body"><span className="confirmation-icon"><Trash2 size={25} /></span>
        <p>确认删除{pendingDelete.length === 1 ? `“${pendingDelete[0].title}”` : `这 ${pendingDelete.length} 个任务`}？</p>
        <p className="muted">任务将从本机数据中移除。</p>
        {notice?.error && <p className="form-error" role="alert">{notice.message}</p>}
      </div>
      <footer className="form-footer"><button className="button" onClick={() => setPendingDelete(null)}>取消</button><button className="button danger-solid" onClick={confirmDelete}><Trash2 size={16} />确认删除</button></footer>
    </Modal>}
    {pendingImport && <Modal title="导入任务" onClose={() => setPendingImport(null)}>
      <div className="confirmation-body"><p className="import-filename">{pendingImport.filename}</p>
        <p><strong>{pendingImport.tasks.length}</strong> 个任务 · {pendingImport.tasks.filter(task => tasks.some(existing => existing.id === task.id)).length} 个重复 ID</p>
        <label className="import-label">导入方式<select value={importMode} onChange={event => setImportMode(event.target.value as 'merge' | 'replace')}><option value="merge">合并，重复 ID 使用导入版本</option><option value="replace">替换所有现有任务</option></select></label>
        {importMode === 'replace' && <p className="form-error">当前 {tasks.length} 个任务将被替换。此操作不可撤销。</p>}
        {importError && <p className="form-error" role="alert">{importError}</p>}
      </div>
      <footer className="form-footer"><button className="button" onClick={() => setPendingImport(null)}>取消</button>
        <button className={`button ${importMode === 'replace' ? 'danger-solid' : 'primary'}`} onClick={() => {
          const error = commit(current => importMode === 'replace' ? pendingImport.tasks : mergeTasks(current, pendingImport.tasks), `已导入 ${pendingImport.tasks.length} 个任务`)
          if (error) setImportError(error)
          else { setPendingImport(null); updateFilters(defaultFilters) }
        }}><ArrowUpFromLine size={16} />确认导入</button>
      </footer>
    </Modal>}
    {resetOpen && <Modal title="重置本机数据" onClose={() => setResetOpen(false)}>
      <div className="confirmation-body"><p>这会清空当前浏览器的任务数据，且无法撤销。请确认已保存所需备份。</p>{notice?.error && <p className="form-error" role="alert">{notice.message}</p>}</div>
      <footer className="form-footer"><button className="button" onClick={() => setResetOpen(false)}>取消</button><button className="button danger-solid" onClick={() => {
        const error = resetTasks()
        setNotice(error ? { message: error, error: true } : { message: '本机数据已重置' })
        if (!error) setResetOpen(false)
      }}>确认重置</button></footer>
    </Modal>}
    {notice && <div className={`toast ${notice.error ? 'toast-error' : ''}`} role={notice.error ? 'alert' : 'status'}>
      {notice.error ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}<span>{notice.message}</span>
      {notice.undo && <button onClick={notice.undo}>撤销</button>}
      <IconButton label="关闭提示" onClick={() => setNotice(null)}><X size={16} /></IconButton>
    </div>}
  </div>
}