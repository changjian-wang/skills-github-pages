import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, Check, X } from 'lucide-react'
import {
  draftSchema, priorities, priorityLabels, projectLabels, projects,
  statusLabels, statuses, type Task, type TaskDraft,
} from './tasks'

export type Editor = { task?: Task; status?: Task['status'] }

export function IconButton({ label, children, onClick, disabled = false }: {
  label: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button type="button" className="icon-button" title={label}
      aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export function Modal({ title, children, onClose, drawer = false }: {
  title: string
  children: ReactNode
  onClose: () => void
  drawer?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const element = dialog.current!
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => {
      element.close()
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  return (
    <dialog ref={dialog} className={drawer ? 'modal drawer' : 'modal'} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="modal-surface">
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <IconButton label="关闭" onClick={onClose}><X size={20} /></IconButton>
        </header>
        {children}
      </div>
    </dialog>
  )
}

export function TaskEditor({ editor, onClose, onSave }: {
  editor: Editor
  onClose: () => void
  onSave: (draft: TaskDraft, original?: Task) => string | null
}) {
  const [initial] = useState<TaskDraft>(() => editor.task ? {
    title: editor.task.title, description: editor.task.description, status: editor.task.status,
    priority: editor.task.priority, project: editor.task.project,
    dueDate: editor.task.dueDate, tags: editor.task.tags,
  } : {
    title: '', description: '', status: editor.status ?? 'todo',
    priority: 'medium', project: 'personal', dueDate: '', tags: [],
  })
  const [draft, setDraft] = useState(initial)
  const [tagText, setTagText] = useState(initial.tags.join(', '))
  const [error, setError] = useState('')
  const [discard, setDiscard] = useState(false)

  function close() {
    if (JSON.stringify(draft) !== JSON.stringify(initial) || tagText !== initial.tags.join(', ')) {
      setDiscard(true)
    } else {
      onClose()
    }
  }

  return (
    <Modal title={editor.task ? '编辑任务' : '新建任务'} onClose={close} drawer>
      <form className="task-form" onSubmit={event => {
        event.preventDefault()
        const parsed = draftSchema.safeParse({
          ...draft,
          tags: [...new Set(tagText.split(/[,，]/).map(tag => tag.trim()).filter(Boolean))],
        })
        if (!parsed.success) { setError(parsed.error.issues[0].message); return }
        const saveError = onSave(parsed.data, editor.task)
        if (saveError) setError(saveError)
        else onClose()
      }}>
        <div className="form-body">
          <label>任务标题 <span className="required">*</span>
            <input autoFocus required maxLength={120} value={draft.title}
              onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="输入任务标题" />
          </label>
          <label>任务详情
            <textarea rows={6} maxLength={5000} value={draft.description}
              onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="补充背景、目标或备注" />
          </label>
          <div className="form-grid">
            <label>状态
              <select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Task['status'] })}>
                {statuses.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
            <label>优先级
              <select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as Task['priority'] })}>
                {priorities.map(priority => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
              </select>
            </label>
            <label>所属项目
              <select value={draft.project} onChange={event => setDraft({ ...draft, project: event.target.value as Task['project'] })}>
                {projects.map(project => <option key={project} value={project}>{projectLabels[project]}</option>)}
              </select>
            </label>
            <label>截止日期
              <input type="date" min="1900-01-01" max="9999-12-31" value={draft.dueDate}
                onChange={event => setDraft({ ...draft, dueDate: event.target.value })} />
            </label>
          </div>
          <label>标签
            <input value={tagText} onChange={event => setTagText(event.target.value)}
              placeholder="例如：发布, 阅读" maxLength={150} />
          </label>
          {error && <p className="form-error" role="alert"><AlertCircle size={16} />{error}</p>}
          {discard && <div className="discard-confirm" role="alert">
            <p>放弃未保存的修改？</p>
            <div className="button-row">
              <button type="button" className="button" onClick={() => setDiscard(false)}>继续编辑</button>
              <button type="button" className="button danger" onClick={onClose}>放弃修改</button>
            </div>
          </div>}
        </div>
        <footer className="form-footer">
          <button type="button" className="button" onClick={close}>取消</button>
          <button className="button primary" type="submit"><Check size={17} />{editor.task ? '保存修改' : '创建任务'}</button>
        </footer>
      </form>
    </Modal>
  )
}