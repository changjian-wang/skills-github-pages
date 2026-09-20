# TASKLINE

React + TypeScript 个人任务管理台，部署在现有博客的 `/skills-github-pages/app/` 下。

## 功能

- 任务新建、详情、编辑、删除与短时撤销。
- 状态、优先级、项目、截止日期及标签。
- 全文搜索、组合筛选、排序、分页、批量完成和删除。
- 列表与看板视图，桌面拖放，以及适用于手机和键盘的状态选择器。
- JSON 导出、合并导入、确认后替换导入；无效文件不会覆盖现有数据。
- 本地存储失败、数据损坏、编辑冲突和未保存修改确认。

## 数据边界

数据保存在当前浏览器同源的 `localStorage`，键为 `taskline.workspace.v1`。
首次打开提供带“示例”标签的演示任务；清空后的任务不会重新生成。

这不是云数据库或登录系统。不同设备、浏览器、浏览器配置文件和站点域名之间不共享数据。
清理浏览器数据会移除任务，请定期导出 JSON。不要在此保存密码或敏感信息。
本地开发地址的数据也不会自动迁移到线上地址，可用 JSON 导出、导入迁移。

同一浏览器的标签页通过 storage 事件同步；编辑期间检测到版本变化时会拒绝覆盖。
`localStorage` 不是事务数据库，不保证多标签页同时写入的原子性。多人协作需要另接后端。

单个工作区最多 2000 个任务，每个标题最多 120 字符、详情最多 5000 字符、标签最多 5 个。
导入文件最大 32 MB；超出浏览器存储配额的导入会被拒绝，不覆盖当前工作区。
最终能保存的数据量取决于浏览器配额，保存失败时修改不会在界面上假装成功。

## 本地开发

推荐 Node.js 24 和 npm。在此目录运行：

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

访问 <http://127.0.0.1:5173/skills-github-pages/app/>。
开发服务器只提供 React 应用；“返回博客”链接在部署后的完整站点中生效。

## 验证

```powershell
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
```

`test:e2e` 会先执行 TypeScript 与 Vite 生产构建，再用 4183 端口启动临时预览服务器。
测试结束后该服务器自动退出，截图与失败追踪位于被 Git 忽略的测试输出目录。

| 验收内容 | 代码与测试 |
| --- | --- |
| 数据结构、日期校验、CRUD、查询与 JSON 往返 | `src/tasks.ts`、`src/tasks.test.ts` |
| 本地存储及跨标签页更新 | `src/useTaskStore.ts`、`e2e/workspace.spec.ts` |
| 列表、看板、详情、表单和批量操作 | `src/TaskWorkspace.tsx`、`src/TaskDialog.tsx`、`e2e/workspace.spec.ts` |
| 320、390、1440、1920 像素宽度与图片资源 | `src/taskline.css`、`e2e/workspace.spec.ts` |

## 部署设计

1. 保留根目录的 Jekyll 博客和现有文章 URL，React 使用独立的 `app/` 源目录。
2. Jekyll 排除整个 `app/`，避免发布源码、依赖或测试文件。
3. Actions 先运行 lint、单元测试和浏览器测试，然后构建博客。
4. 将 React 的 `dist/` 复制到博客产物的 `app/`，上传一份 Pages artifact。
5. 部署任务依赖构建任务成功，只部署合并后的站点。

仓库 Pages 的 Source 应为 GitHub Actions。推送 `main` 或手动运行
`Deploy blog and task workspace` 即可发布，不需要额外配置密钥。

如果更改仓库名或部署子路径，需要同步调整 Vite 的 `base`、测试服务器地址和博客入口。
回滚应用版本时重新部署之前的代码提交；用户数据不存储在 Git 中，也不会随代码回滚。
