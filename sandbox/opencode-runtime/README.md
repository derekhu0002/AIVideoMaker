# Isolated OpenCode Sandbox

此目录专用于 **隔离验证 opencode 多 Agent runtime**。

隔离约定：

- 仅在本目录内运行 `opencode`
- 所有 `.opencode/runtime`、`.opencode/temp`、`runs/` 状态都只允许落在本目录
- 禁止在这里写回主工作区 `.opencode/runtime` 与 `.opencode/temp`
- Python 主应用仅通过桥接 manifest 回读结果
