# AI Video Maker 可演示版本

一个运行在**用户本机**、通过**本机浏览器访问**的 AI 视频制作网站雏形。

当前版本重点演示：
- 本地项目创建与阶段化创作流程
- 基于 **OpenCode sandbox** 的多 Agent 隔离桥接验证
- 本地可追溯的项目、产物、日志、确认记录与导出证据
- **仅人工确认发布**，不实现无确认自动直发

---

## 1. 项目定位

本项目是一个面向个人创作者的**本地部署 AI 视频制作网站**。

核心定位：
- **本地部署**：服务运行在用户本机
- **本机浏览器访问**：默认访问 `http://127.0.0.1:8000`
- **AI 视频制作工作台**：围绕脚本、分镜、配音文案、字幕、封面、发布素材进行协作
- **OpenCode 多 Agent 沙箱团队**：在仓库内独立沙箱目录中做真实 runtime 验证，并通过 Python 编排层桥接回主应用
- **人工确认发布边界**：抖音 MVP 仅允许“生成发布素材 + 人工确认发布”，**禁止无确认自动直发**

---

## 2. 快速启动

### 启动应用

```bash
python3 run.py
```

启动后访问：

```text
http://127.0.0.1:8000
```

### 推荐首次演示步骤

1. 创建一个新项目
2. 点击“**桥接驱动生成**”或“生成全流程草案”
3. 查看阶段化产物
4. 逐项人工确认
5. 生成成片导出记录
6. 生成发布素材包
7. 生成人工发布交接页
8. 打开导出目录 / 打开交接页，演示本地交接闭环

---

## 3. 核心能力概览

### 3.1 本地创作者工作台
- 项目创建与 Brief 输入
- 项目列表与状态查看
- 阶段化产物编辑 / 确认 / 重生
- 锁定、失效、解冻重生状态展示

### 3.2 阶段化创作模型
当前内置阶段：
- `script`
- `storyboard`
- `voiceover`
- `subtitles`
- `cover`
- `publish_package`

每个阶段支持：
- 版本记录
- 当前内容查看与编辑
- 人工确认
- 上游变更导致下游待复核

### 3.3 OpenCode runtime bridge（隔离）
- 在仓库内独立 `sandbox/opencode-runtime/` 运行 OpenCode
- Python 后端可触发真实 sandbox run
- 捕获 stdout / stderr / result / manifest
- 将桥接结果回写到项目状态
- 若 bridge 不可用，主流程可回退到现有 stub 生成

### 3.4 导出与人工发布交接
- manifest 驱动 media export
- 本地导出清单页与证据文件
- 本地 handoff HTML 页面
- 本机安全动作：打开导出目录 / 打开交接页 / 记录复制发布文案
- launch evidence 持久化

### 3.5 可追溯与审计
- 项目总状态落盘
- 阶段版本文件落盘
- workflow run 落盘
- runtime bridge 落盘
- audit 日志落盘
- acceptance checklist / sample / walkthrough 落盘

---

## 4. 关键 API 与主流程说明

### 4.1 基础 API

- `GET /api/health`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`

### 4.2 生成相关

- `POST /api/projects/:id/generate`
  - 使用本地 stub 生成主流程草案

- `POST /api/projects/:id/runtime-bridge-run`
  - 执行一次真实的 sandbox OpenCode bridge 验证

- `POST /api/projects/:id/generate-with-bridge`
  - 先跑真实 sandbox bridge
  - 若 bridge 成功，则将桥接结果写回并继续主流程生成
  - 若 bridge 失败，则自动 fallback 到本地 stub 生成

### 4.3 阶段化产物

- `POST /api/projects/:id/artifacts/:stage/edit`
- `POST /api/projects/:id/artifacts/:stage/confirm`
- `POST /api/projects/:id/artifacts/:stage/regenerate`

说明：
- 已确认阶段会冻结
- 若需修改冻结阶段，需要显式解冻再重生
- 上游修改会让下游进入待复核状态

### 4.4 导出与发布准备

- `POST /api/projects/:id/media-export`
- `POST /api/projects/:id/export-package`
- `POST /api/projects/:id/manual-publish-handoff`
- `POST /api/projects/:id/manual-launch`

说明：
- 只有**所有阶段都人工确认后**，才能继续导出和交接
- `manual-launch` 仅用于**安全本地动作记录**，不执行平台自动发布

---

## 5. 数据与产物目录说明

运行后主要产物位于：

```text
data/projects/<project-id>/
```

### 5.1 项目核心状态
- `project.json`：项目总状态

### 5.2 阶段产物
- `artifacts/<stage>/vN.json`：阶段版本文件

### 5.3 审计与 workflow
- `audit/events.jsonl`：业务审计日志
- `workflow-runs/<run-id>.json`：主流程运行记录

### 5.4 runtime bridge
- `runtime-bridge/<bridge-run-id>/project-snapshot.json`
- `runtime-bridge/<bridge-run-id>/stdout.log`
- `runtime-bridge/<bridge-run-id>/stderr.log`
- `runtime-bridge/<bridge-run-id>/result.json`
- `runtime-bridge/<bridge-run-id>/manifest.json`

### 5.5 QA / Audit 材料
- `runtime-bridge/acceptance-checklist.md`
- `runtime-bridge/acceptance-sample.json`
- `runtime-bridge/demo-walkthrough.md`

### 5.6 导出与交接产物
- `exports/media-manifest-vN.json`
- `exports/assets-manifest-vN.json`
- `exports/subtitles-vN.srt`
- `exports/export-bundle-vN.html`
- `exports/export-evidence-vN.json`
- `exports/README-export-vN.md`
- `exports/final-cut-vN.txt`
- `exports/publish-package-vN.json`
- `exports/manual-publish-handoff-vN.json`
- `exports/manual-publish-handoff-vN.html`

---

## 6. OpenCode sandbox / runtime bridge 隔离设计

### 6.1 为什么需要隔离
仓库根目录已有 `.opencode/` 运行时状态。为了避免 bridge 验证污染主 workspace，本项目采用**双工作区策略**：

- 主工作区：产品应用运行目录
- 沙箱工作区：专门用于 OpenCode runtime 验证

### 6.2 沙箱目录

```text
sandbox/opencode-runtime/
```

作用：
- 放置隔离的 OpenCode 配置与 Agent 定义
- 每次运行时复制出 per-run worktree
- 只在该目录及其 `runs/` 下产生 sandbox runtime 痕迹

### 6.3 bridge 行为
- Python 后端发起 `opencode run`
- 为每次 bridge 分配 `run-id`
- 生成 snapshot / manifest / stdout / stderr / result
- 回写到项目状态中的 `runtimeBridgeRuns`

### 6.4 隔离保证
- 主 workspace `.opencode/runtime` 与 `.opencode/temp` 不用于 sandbox 验证写入
- 验收脚本会检查隔离标记与相关证据

---

## 7. 演示路径（Demo Walkthrough）

推荐按以下顺序演示：

### 路径 A：完整演示
1. 启动服务并进入工作台
2. 创建项目
3. 点击“**桥接驱动生成**”
4. 展示 bridge 结果与 workflow 记录
5. 查看脚本 / 分镜 / 字幕等阶段产物
6. 逐项确认阶段内容
7. 生成成片导出记录
8. 打开导出清单页 `export-bundle-vN.html`
9. 生成发布素材包
10. 生成人工发布交接页 `manual-publish-handoff-vN.html`
11. 演示“打开导出目录 / 打开交接页 / 复制发布文案”的安全动作与证据记录

### 路径 B：QA / Audit 快速核对
直接检查项目目录中的：
- `runtime-bridge/acceptance-checklist.md`
- `runtime-bridge/acceptance-sample.json`
- `runtime-bridge/demo-walkthrough.md`
- `exports/export-evidence-vN.json`
- `exports/manual-publish-handoff-vN.html`

---

## 8. 当前边界与已知非阻塞限制

以下限制是**当前版本真实状态**，不是遗漏：

1. **真实成片流水线尚未完成**
   - 当前 media export 为 manifest 驱动 + 本地导出占位物
   - 已足够用于演示闭环，但还不是完整视频渲染引擎

2. **runtime bridge 仍属于最小桥接**
   - 已实现真实 sandbox OpenCode run
   - 已能回写项目状态
   - 但主流程依然保留 stub fallback

3. **人工确认发布边界不可越过**
   - 当前只支持发布素材与交接页生成
   - 不支持无确认自动直发

4. **细粒度继续生成 UX 仍可继续增强**
   - 当前已实现锁定 / 失效 / 解冻并重生
   - 但更复杂的局部继续生成策略仍可后续完善

5. **本机调起能力遵循安全优先**
   - 以打开本地目录 / HTML / 记录证据为主
   - 不做高风险自动外部操作

---

## 9. 测试命令

### 基础语法检查

```bash
python3 -m py_compile run.py app/*.py tests/*.py
```

### API 回归

```bash
python3 tests/test_api_regression.py
```

### sandbox bridge 隔离验证

```bash
python3 tests/test_sandbox_bridge.py
```

### 演示主流程验证

```bash
python3 tests/test_demo_flow.py
```

### 演示产物与证据验证

```bash
python3 tests/test_demo_artifacts.py
```

---

## 10. 当前版本一句话总结

这是一个已经具备**本地工作台 + 隔离 OpenCode bridge + 阶段化创作 + 可追溯导出 + 人工发布交接**能力的**可演示版本**，重点验证本地 AI 视频制作流程与人工确认发布边界，而非追求完整生产级媒体渲染能力。
