# skills 使用说明（中文）

本目录用于存放项目执行阶段的技能源文件（Skill）。
本说明文档为每个 Skill 提供：用途、输入、输出、使用方法与注意事项，便于团队成员快速上手。

## 使用前通用约定
- 默认输入架构数据文件：`design\KG\SystemArchitecture.json`
- 输出目录统一放在：`implementation\`
- 输出语言：除非 Skill 另有说明，建议中文
- 路径统一使用相对路径，便于在仓库内协作与追踪

## KG 视图解引用约定（强制）
- `design\KG\SystemArchitecture.json` 采用引用式结构：`views[*].included_elements` 与 `views[*].included_relationships` 仅保存 ID。
- 任何 Skill 只要分析某个 View，都必须同时读取顶层 `elements`、`relationships`、`views` 三个数组。
- 必须先对 View 中的元素 ID、关系 ID 做全局反查，再输出 View 语义、关系类型、依赖分析、缺口判断。
- 不能因为 View 局部只看到 ID，就直接判断“语义缺失”。只有当顶层数组里也查不到对应 ID 时，才能认定 KG 不完整。
- 如果执行时只拿到了 JSON 的局部片段，必须明确说明“当前结论基于局部，需完成全局 ID 解引用后再最终判断”。

## 输出边界（必须区分）

为避免混淆，本仓库存在两类输出：

### Skill 使用模式（新增）
- `模板型 Skill（由 LM Tool 或 Skill Runner 直接读取）`：作为 Copilot/OpenCode 技能模板被读取或引用，默认不直接写文件。
	- 典型文件：`ai4pb-init/SKILL.md`、`ai4pb-audit/SKILL.md`、`ai4pb-wrapup/SKILL.md`、`ai4pb-iteration-issues/SKILL.md`、`ai4pb-iteration-summary/SKILL.md`、`ai4pb-task-list/SKILL.md`、`ai4pb-task-support/SKILL.md`、`ai4pb-weekly-report/SKILL.md`
- `产出型执行结果`：在会话中执行后，按技能约定将结果写入 `implementation/*`（是否落盘取决于执行者是否按技能执行）。

### A. LLM 内容输出（`implementation/*`）
- 由 Skill 驱动生成的业务/项目文档内容。
- 典型文件：
	- `implementation/task-list.md`
	- `implementation/taskhelpinfos/*.md`
	- `implementation/reports/*.md`

### B. 扩展运行时输出（`TEMP/*`）
- 由 VS Code 扩展命令自动生成的运行时工件，不属于 Skill 业务文档产物。
- 典型文件：
	- `TEMP/iteration-state.json`
	- `TEMP/design-code-alignment-*.md`
	- `TEMP/wrap-up-*.md`
	- `design/temp/audit.md`（Design Audit 专用临时输出）

### 结论
- `implementation/*`：用于交付给团队阅读和执行的内容成果。
- `TEMP/*` 与 `design/temp/audit.md`：用于扩展运行过程追踪、对齐检查和会话收尾的过程工件。
- `skills/*/SKILL.md`：首先是 Skill 资产本体，是否生成文件取决于具体 Skill 类型与执行流程。

---

## 1) `ai4pb-weekly-report/SKILL.md`
### 用途
生成项目周报（中文），用于管理层/干系人同步项目目标、整体进度、关键任务、风险与缺口。

### 输入
- 架构与任务数据：`design\KG\SystemArchitecture.json`
-（可选）任务支撑文件目录：`implementation\taskhelpinfos`（用于回填 Task Help Link）

### 输出
- 周报文件：`implementation\reports\*.md`

### 输出重点
- 按章节输出：执行摘要、总体进展、关键任务、项目级风险与缺口
- **关键任务必须以 Markdown 表格输出**
- 表格内包含 `Task Help Link`，若未找到对应文件则标记 `N/A (file not generated yet)`

### 适用场景
- 每周例会前汇总
- 向管理层提交阶段性进展

---

## 2) `ai4pb-task-support/SKILL.md`
### 用途
为每个任务生成“执行支撑说明”文档，帮助负责人明确目标、步骤、交付物、风险与本周行动。

### 输入
- 架构与任务数据：`design\KG\SystemArchitecture.json`

### 输出
- 逐任务说明文件目录：`implementation\taskhelpinfos\`
- 文件命名建议：`{start_date}_{task_name_slug}.md`
- 任务索引表（可在输出末尾生成）

### 输出重点
每个任务说明文件应包含：
1. 任务名称、关联架构对象、负责人、优先级、时间窗口
2. 任务目标与业务价值
3. 输入信息与依赖项
4. 可执行步骤（按顺序）
5. 交付物与验收标准
6. 风险/缺口与缓解措施
7. 本周建议行动

### 适用场景
- 任务分派后，给执行人提供可落地操作说明
- 新成员快速理解任务上下文

---

## 3) `ai4pb-task-list/SKILL.md`
### 用途
生成完整任务清单（单文件），并按“Active + 高优先级靠前”排序，便于团队快速识别当前要做的事。

### 输入
- 架构与任务数据：`design\KG\SystemArchitecture.json`
-（可选）任务支撑文件目录：`implementation\taskhelpinfos`（用于链接）

### 输出
- 任务总清单：`implementation\task-list.md`

### 排序规则
1. `Active` 状态优先
2. 同状态下按优先级：`High > Medium > Low`
3. 同状态同优先级下按 `due_date` 升序

### 输出重点
- 单一 Markdown 表格（全量任务）
- 包含到期天数、关键交付、Task Help Link
- 含汇总统计：状态分布、优先级分布、负责人分布、7天内到期、未分配任务

### 适用场景
- 每日站会/周计划前快速拉齐待办
- PM/TL 做排期与资源调整

---

## 4) `ai4pb-init/SKILL.md`
### 用途
用于项目启动阶段的初始引导（目标澄清、范围界定、首轮计划生成）。

### 建议用法
- 在项目初建或新迭代启动时先执行
- 产出初始任务框架后，再衔接 `task-support-prompt.md` 与 `task-list-prompt.md`

### 建议输出
- 初始目标与范围说明
- 初版里程碑/任务拆解
- 初版风险清单

---

## 5) `ai4pb-audit/SKILL.md`
### 用途
用于对现有系统/工程进行逆向梳理，提取结构、依赖、流程与薄弱点。

### 建议用法
- 接手存量项目时使用
- 在架构不完整或文档缺失时优先执行
- 当作为 AI4PB Design Audit 使用时，应执行只读差异审计，并仅将结果写入 `design/temp/audit.md`

### 建议输出
- 系统全景结构
- 关键模块职责与依赖
- 主要风险与改进建议
- 设计审计场景下的架构变更建议与 traceability 修正项

---

## 6) `ai4pb-wrapup/SKILL.md`
### 用途
用于阶段收尾与总结，形成迭代/阶段复盘材料。

### 建议用法
- 版本发布前后
- 里程碑完成后

### 建议输出
- 目标达成情况
- 已完成/未完成项
- 风险闭环情况
- 下一阶段建议

---

## 7) `[PROPOSED] ai4pb-ask/SKILL.md`
### 用途
通用问答或补充分析入口，用于临时问题澄清与特定主题深挖。

> 当前状态：`ai4pb-ask/SKILL.md` 尚未在本目录落地，也未在扩展 `languageModelTools` 中注册；该条目作为候选能力保留。

### 建议用法
- 当现有专用 Prompt 不完全匹配需求时
- 快速生成一次性分析结论

### 建议输出
- 问题结论
- 关键证据/依据
- 可执行下一步

---

## 8) `ai4pb-iteration-issues/SKILL.md`
### 用途
用于“首轮验收后”的问题续作：读取 `design\tasks\taskandissues_for_LLM.md`，结合架构任务状态继续修复未完成项。

### 输入
- 架构与任务数据：`design\KG\SystemArchitecture.json`
- 问题清单：`design\tasks\taskandissues_for_LLM.md`

### 输出
- 单份迭代续作报告（建议 markdown）：
	- 已处理问题项与证据
	- 剩余阻塞与下一步建议

### 适用场景
- 首轮开发验收后出现未通过项
- 测试人员导出问题清单后，进入多轮迭代修复

---

## 推荐执行顺序（实战）
1. `ai4pb-init/SKILL.md`（启动/新迭代）
2. `ai4pb-audit/SKILL.md`（如需补齐存量认知或做设计审计）
3. `ai4pb-task-support/SKILL.md`（生成任务执行说明）
4. `ai4pb-task-list/SKILL.md`（生成全量优先级清单）
5. `ai4pb-weekly-report/SKILL.md`（对外周报）
6. `ai4pb-wrapup/SKILL.md`（阶段收尾）
7. `ai4pb-iteration-issues/SKILL.md`（验收问题续作）

---

## 维护建议
- 新增 Skill 时，请同步在本 README 增加对应章节（用途/输入/输出/示例）
- 输出目录和命名规则尽量固定，减少跨文件链接失效
- 建议每周固定时间运行 `ai4pb-task-list/SKILL.md` + `ai4pb-weekly-report/SKILL.md` 保持信息新鲜度
