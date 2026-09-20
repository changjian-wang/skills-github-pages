import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './taskline.css'
import TaskWorkspace from './TaskWorkspace.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TaskWorkspace />
  </StrictMode>,
)
