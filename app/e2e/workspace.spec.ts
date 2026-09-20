import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const storageKey = 'taskline.workspace.v1'

async function storedTasks(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!).tasks, storageKey)
}

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('全部任务')
})

test('create, read, update, persist, cancel delete, delete and undo', async ({ page }) => {
  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '新建任务', exact: true })
  await editor.getByLabel('任务标题').fill('   ')
  await editor.getByRole('button', { name: '创建任务', exact: true }).click()
  await expect(editor.getByRole('alert')).toHaveText('请输入任务标题')
  await editor.getByLabel('任务标题').fill('浏览器验收任务')
  await editor.getByLabel('任务详情', { exact: true }).fill('第一行\n第二行 <script>alert(1)</script>')
  await editor.getByRole('combobox', { name: '状态', exact: true }).selectOption('doing')
  await editor.getByRole('combobox', { name: '优先级', exact: true }).selectOption('high')
  await editor.getByRole('combobox', { name: '所属项目', exact: true }).selectOption('engineering')
  await editor.getByLabel('截止日期').fill('2026-10-01')
  await editor.getByLabel('标签', { exact: true }).fill('验收, React')
  await editor.getByRole('button', { name: '创建任务', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await page.getByRole('button', { name: '浏览器验收任务', exact: true }).click()
  const detail = page.getByRole('dialog', { name: '任务详情', exact: true })
  await expect(detail.locator('.detail-description')).toContainText('<script>alert(1)</script>')
  await expect(detail.locator('.detail-description script')).toHaveCount(0)
  await detail.getByRole('button', { name: '编辑任务', exact: true }).click()
  await page.getByLabel('任务标题').fill('已编辑的验收任务')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '已编辑的验收任务', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '删除：已编辑的验收任务', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('button', { name: '已编辑的验收任务', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '删除：已编辑的验收任务', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByRole('button', { name: '已编辑的验收任务', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByRole('button', { name: '已编辑的验收任务', exact: true })).toBeVisible()
  const saved = await storedTasks(page)
  expect(saved).toHaveLength(9)
  expect(saved.find((task: { title: string }) => task.title === '已编辑的验收任务')).toMatchObject({
    status: 'doing', priority: 'high', project: 'engineering', tags: ['验收', 'React'], dueDate: '2026-10-01',
  })
})

test('discard confirmation preserves or abandons an unsaved draft', async ({ page }) => {
  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  await page.getByLabel('任务标题').fill('未保存草稿')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('alert')).toContainText('放弃未保存的修改')
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.getByLabel('任务标题')).toHaveValue('未保存草稿')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await storedTasks(page)).toHaveLength(8)
})

test('combined search, selection, batch completion and empty result', async ({ page }) => {
  await page.getByRole('textbox', { name: '搜索任务' }).fill('react')
  await page.getByRole('combobox', { name: '筛选状态', exact: true }).selectOption('doing')
  await page.getByRole('combobox', { name: '筛选优先级', exact: true }).selectOption('high')
  await expect(page.locator('.task-row')).toHaveCount(2)
  await page.getByRole('checkbox', { name: '选择本页全部任务' }).check()
  await page.getByRole('button', { name: '标记完成', exact: true }).click()
  await expect(page.getByRole('heading', { name: '没有匹配的任务' })).toBeVisible()
  await page.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(page.locator('.task-row')).toHaveCount(8)
  await page.getByRole('checkbox', { name: '选择本页全部任务' }).check()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByRole('heading', { name: '还没有任务' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '还没有任务' })).toBeVisible()
  expect(await storedTasks(page)).toEqual([])
})

test('native kanban drag changes status and dropdown remains available', async ({ page }) => {
  await page.getByRole('button', { name: '看板', exact: true }).click()
  const title = '完成 React 管理台交互验收'
  const source = page.locator('.task-card').filter({ has: page.getByRole('button', { name: title, exact: true }) })
  const destination = page.getByRole('region', { name: '已完成看板', exact: true })
  await source.dragTo(destination.locator('.column-heading'), {
    sourcePosition: { x: 16, y: 16 }, targetPosition: { x: 24, y: 24 },
  })
  await expect(destination.getByRole('button', { name: title, exact: true })).toBeVisible()
  await destination.getByRole('combobox', { name: `状态：${title}`, exact: true }).selectOption('todo')
  await expect(page.getByRole('region', { name: '待处理看板' }).getByRole('button', { name: title, exact: true })).toBeVisible()
})

test('real export roundtrip, invalid import protection and replacement', async ({ page }) => {
  const before = await storedTasks(page)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click()
  const download = await downloadPromise
  const content = await readFile((await download.path())!, 'utf8')
  expect(JSON.parse(content)).toEqual({ version: 1, tasks: before })
  const input = page.locator('input[type=file]')
  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"tasks":[{}]}') })
  await expect(page.getByRole('alert')).toContainText('文件无效')
  expect(await storedTasks(page)).toEqual(before)
  await input.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(content) })
  await page.getByRole('dialog', { name: '导入任务' }).getByRole('button', { name: '确认导入' }).click()
  expect(await storedTasks(page)).toEqual(before)
  await input.setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"tasks":[]}') })
  const dialog = page.getByRole('dialog', { name: '导入任务' })
  await dialog.getByRole('combobox').selectOption('replace')
  await expect(dialog).toContainText('此操作不可撤销')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(await storedTasks(page)).toEqual(before)
  await input.setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"tasks":[]}') })
  await dialog.getByRole('combobox').selectOption('replace')
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click()
  expect(await storedTasks(page)).toEqual([])
  await input.setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(content) })
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click()
  expect(await storedTasks(page)).toEqual(before)
})

test('large Unicode backups can be exported and imported again', async ({ page }) => {
  const [template] = await storedTasks(page)
  const tasks = Array.from({ length: 160 }, (_, index) => ({
    ...template, id: `backup-${index}`, title: `备份任务 ${index}`, description: '文'.repeat(5000),
  }))
  const buffer = Buffer.from(JSON.stringify({ version: 1, tasks }))
  expect(buffer.length).toBeGreaterThan(2 * 1024 * 1024)
  const input = page.locator('input[type=file]')
  await input.setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer })
  const dialog = page.getByRole('dialog', { name: '导入任务' })
  await dialog.getByRole('combobox').selectOption('replace')
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click()
  expect(await storedTasks(page)).toHaveLength(160)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 JSON', exact: true }).click()
  const download = await downloadPromise
  await input.setInputFiles((await download.path())!)
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click()
  expect(await storedTasks(page)).toEqual(tasks)
})

test('pagination and sorting operate on the entire result', async ({ page }) => {
  const [template] = await storedTasks(page)
  const tasks = Array.from({ length: 25 }, (_, index) => ({
    ...template, id: `pagination-${index}`, title: `Task ${String(index).padStart(2, '0')}`,
    status: 'todo', priority: index === 24 ? 'high' : 'low',
  }))
  await page.locator('input[type=file]').setInputFiles({
    name: 'pagination.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, tasks })),
  })
  const dialog = page.getByRole('dialog', { name: '导入任务' })
  await dialog.getByRole('combobox').selectOption('replace')
  await dialog.getByRole('button', { name: '确认导入' }).click()
  await expect(page.locator('.task-row')).toHaveCount(10)
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.locator('.task-row')).toHaveCount(5)
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
  await page.getByRole('combobox', { name: '排序方式' }).selectOption('priority')
  await expect(page.locator('.task-title').first()).toHaveText('Task 24')
  await expect(page.locator('.page-number')).toHaveText('1 / 3')
  await page.getByRole('combobox', { name: '每页任务数' }).selectOption('50')
  await expect(page.locator('.task-row')).toHaveCount(25)
})

test('storage write failure does not report success or change saved data', async ({ page }) => {
  const before = await storedTasks(page)
  await page.evaluate(key => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage full', 'QuotaExceededError')
      return original.call(this, name, value)
    }
  }, storageKey)
  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  await page.getByLabel('任务标题').fill('不应保存')
  await page.getByRole('button', { name: '创建任务', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('保存失败')
  expect(await storedTasks(page)).toEqual(before)
})

test('corrupt storage is not overwritten and recovery requires confirmation', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key, 'corrupt-original-data'), storageKey)
  await page.reload()
  await expect(page.locator('.error-banner')).toContainText('原始数据未被覆盖')
  await expect(page.getByRole('button', { name: '新建任务', exact: true })).toBeDisabled()
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe('corrupt-original-data')
  await page.getByRole('button', { name: '重置数据', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe('corrupt-original-data')
  await page.getByRole('button', { name: '重置数据', exact: true }).click()
  await page.getByRole('button', { name: '确认重置', exact: true }).click()
  await expect(page.locator('.error-banner')).toHaveCount(0)
  expect(await storedTasks(page)).toEqual([])
})

test('cross-tab updates are received without losing an edited draft', async ({ page, context }) => {
  const second = await context.newPage()
  await second.goto('./')
  const title = '完成 React 管理台交互验收'
  await page.getByRole('button', { name: `编辑：${title}`, exact: true }).click()
  await page.getByLabel('任务标题').fill('过时的编辑')
  await second.getByRole('combobox', { name: `状态：${title}`, exact: true }).selectOption('done')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('已被其他操作更新')
  const saved = await storedTasks(page)
  expect(saved.find((task: { title: string }) => task.title === title).status).toBe('done')
  await second.close()
})

test('desktop and mobile layouts, assets and mobile CRUD', async ({ page }, testInfo) => {
  for (const width of [1440, 1920, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect(page.getByRole('button', { name: '新建任务', exact: true })).toBeVisible()
    const geometry = await page.evaluate(() => ({
      width: innerWidth, document: document.documentElement.scrollWidth,
      brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).length,
    }))
    expect(geometry.document).toBeLessThanOrEqual(geometry.width)
    expect(geometry.brokenImages).toBe(0)
    await page.screenshot({ path: testInfo.outputPath(`list-${width}.png`), fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开导航', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '今日待办 2', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('今日待办')
  await page.getByRole('button', { name: '新建任务', exact: true }).click()
  await page.getByLabel('任务标题').fill('手机端创建任务')
  await page.getByRole('button', { name: '创建任务', exact: true }).click()
  await page.getByRole('button', { name: '打开导航', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '全部任务 9', exact: true }).click()
  await expect(page.getByRole('button', { name: '手机端创建任务', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '看板', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('board-mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('board-desktop.png'), fullPage: true })
})