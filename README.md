# CPABM 批量认证文件管理前端

基于 Vue 3 的管理控制台，用于 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 的认证文件、AI 提供商、OAuth 登录、日志与使用统计。

## 功能亮点

- ✅ **认证文件表格管理** - 搜索/筛选/排序/分页，批量启用/禁用/删除，上传/下载/批量下载，在线编辑 JSON，模型查看
- ✅ **批量字段修改** - 单/多字段、类型转换、模板变量、预览与并发重试
- ✅ **配额与可用性** - Antigravity/Gemini CLI/Codex 配额查询与缓存，可用性监控条
- ✅ **AI 提供商配置** - Gemini/Claude/Codex/Vertex/OpenAI 的新增、编辑、批量删除、启用/禁用、优先级/前缀/代理/自定义 Header
- ✅ **OAuth 登录与导入** - Codex/Anthropic/Antigravity/Gemini CLI/Kimi/Qwen；支持回调 URL 提交；Vertex 凭证导入
- ✅ **仪表盘与日志** - 请求与 Token 统计、Top API/模型、错误趋势；日志搜索/自动刷新/下载/清空；错误日志与请求日志查看
- ✅ **设置中心** - 全局代理、重试次数、路由策略、配额回退策略、日志开关、API Keys、OAuth 模型排除与别名

## 技术栈

- Vue 3 + Vite + TypeScript
- Tailwind CSS
- Pinia
- Axios
- ECharts
- Lucide Icons

## 快速开始

### 1. 安装依赖

```bash
cd batch-auth-manager
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:5174`

### 3. 连接到 CLIProxyAPI

1. 启动 CLIProxyAPI，并确保管理接口 `/v0/management` 可用
2. 点击"连接服务器"
3. 输入 API 地址（如 `http://localhost:8317`）与管理密钥
4. 连接成功后进入各功能页

可选：如果希望走同源代理，可将 API 地址填写为 `http://localhost:5174`，Vite 会将 `/v0` 代理到 `http://localhost:8317`。

### 4. 预览构建

```bash
npm run build
npm run preview
```

访问 `http://localhost:4173`

## 页面说明

### 认证文件

- 表格视图：搜索/筛选/排序/分页
- 批量操作：启用/禁用/删除、批量下载
- 文件操作：上传、下载、在线编辑 JSON、查看模型
- 属性展示：proxy_url、prefix、max_tokens、api_base/api_endpoint、model、temperature
- 可用性监控：基于使用统计生成时间条
- 配额摘要：支持 Antigravity/Gemini CLI/Codex

### 批量字段修改

- 单字段/多字段模式，支持 `string` / `number` / `boolean` / `json`
- 模板变量：`{AUTO_INCREMENT}`、`{RANDOM_NUMBER}`、`{RANDOM_ALPHA}`、`{RANDOM_HEX}`、`{RANDOM_UUID}`、`{FILE_NAME}`、`{INDEX}`
- 预览前 3 个文件的变更，分批并发处理，失败自动重试

### 配额查询

- 通过 `/v0/management/api-call` 查询配额
- 支持 Antigravity / Gemini CLI / Codex
- 结果缓存（成功 5 分钟、失败 1 分钟），表格中显示最严重配额状态
- 继承认证文件的 `proxy_url`，若未设置则使用全局代理

### AI 提供商

- 支持 Gemini / Claude / Codex / Vertex / OpenAI
- 新增、编辑、批量删除
- 配置字段：API Key、名称、前缀、优先级、代理、Base URL、自定义 Header、排除模型
- 启用/禁用（Gemini/Claude/Codex）；Gemini/Codex 支持配额查询

### OAuth 登录

- Codex / Anthropic / Antigravity / Gemini CLI / Kimi / Qwen
- WebUI 回调 URL 提交（远程浏览器场景）
- Vertex 凭证导入（可选填写 location）

### 仪表盘

- 总请求/成功率/Token 统计
- 每日/每小时趋势图
- Top API、Top 模型、Token 组成
- 错误趋势与错误来源统计

### 日志

- 日志搜索、自动刷新、下载、清空
- 请求错误日志列表与下载
- 根据请求 ID 查看/下载请求日志

### 设置

- 全局代理、请求重试次数、路由策略
- 配额回退策略：切项目/切预览模型
- 使用统计、请求日志、写入日志文件、WebSocket 鉴权
- API Keys 管理
- OAuth 模型排除与别名映射

## 生产构建

```bash
npm run build
```

构建产物在 `dist/` 目录。

## 许可证

MIT
