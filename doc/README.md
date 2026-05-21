# Open Design 项目文档

## 目录

1. [项目简介](项目简介.md) — 功能特性、技术架构、快速开始
2. [技术原理](技术原理.md) — 系统拓扑、组件设计、数据流
3. [技能系统](技能系统.md) — 内置技能、设计系统、扩展方式
4. [智能代理](智能代理.md) — 支持的 CLI、协议适配器、BYOK 代理
5. [功能拓展](功能拓展.md) — 自定义技能、设计系统、主题方向
6. [部署指南](部署指南.md) — Docker、本地开发、打包应用

---

## 项目简介

**Open Design** 是 [Anthropic Claude Design](https://docs.anthropic.com/en/docs/claude-design) 的开源替代方案。它是一个本地优先、设计导向的工具，自动检测你机器上安装的编码智能体 CLI（Claude Code、Codex、Cursor Agent、Gemini CLI 等），并将它们作为设计引擎，通过可组合的 Skills 和 Design Systems 驱动设计流程。

### 核心特性

| 特性 | 说明 |
|---|---|
| **16 种编码智能体** | Claude Code、Codex、Devin、Cursor Agent、Gemini CLI、OpenCode、Qwen Code、Qoder CLI、GitHub Copilot CLI、Hermes、Kimi CLI、Pi、Kiro CLI、Kilo、Mistral Vibe CLI、DeepSeek TUI |
| **BYOK 回退方案** | 支持 Anthropic、OpenAI、Azure OpenAI、Google Gemini API |
| **31 种内置技能** | 原型设计、演示文稿、仪表板、移动应用等 |
| **72+ 设计系统** | Linear、Stripe、Vercel、Airbnb、Tesla、Notion、Apple、Anthropic 等品牌设计规范 |
| **媒体生成** | gpt-image-2（图像）、Seedance 2.0（视频）、HyperFrames（HTML→MP4） |
| **本地持久化** | SQLite 数据库存储项目、会话、消息；本地文件系统存储产物 |
| **部署方式** | Docker Compose、本地开发（pnpm tools-dev）、Electron 桌面应用 |

### 技术栈

| 层级 | 技术栈 |
|---|---|
| 前端 | Next.js 16 App Router + React 18 + TypeScript |
| 后端守护进程 | Node 24 + Express + SSE 流式传输 + better-sqlite3 |
| 智能体传输 | child_process.spawn，支持多种 CLI 的事件解析器 |
| BYOK 代理 | OpenAI 兼容端点规范化器，带 SSRF 防护 |
| 存储 | SQLite + .od/ 目录下的纯文件 |
| 桌面（可选） | Electron 外壳，带 sidecar IPC |

### 快速开始

#### 环境要求

- **Node.js:** ~24（通过 `package.json#engines` 强制）
- **pnpm:** 10.33.x（通过 `packageManager` 固定）
- **操作系统:** macOS、Linux、Windows（WSL2 推荐）

#### 使用 Docker 运行

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design/deploy
docker compose up -d
# 浏览器打开 http://localhost:7456
```

#### 从源码运行

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # 应显示 10.33.2
pnpm install
pnpm tools-dev run web    # 启动守护进程 + Web 前端
# 打开 tools-dev 输出的 Web URL
```

#### 下载桌面应用

无需构建，直接下载预构建的桌面应用：

- **[open-design.ai](https://open-design.ai/)** — 官方下载页面
- **[GitHub Releases](https://github.com/nexu-io/open-design/releases)**

---

## 目录结构

```
open-design/
├── apps/
│   ├── daemon/           # Express + SQLite 守护进程，拥有 /api/* 路由
│   ├── web/              # Next.js 16 App Router + React 客户端
│   ├── desktop/         # Electron 外壳
│   ├── packaged/        # 打包的 Electron 运行入口
│   └── landing-page/     # 营销落地页
├── packages/
│   ├── contracts/        # Web/守护进程契约层
│   ├── sidecar-proto/    # Sidecar 业务协议
│   ├── sidecar/         # 通用 sidecar 运行时原语
│   └── platform/         # 通用 OS 进程原语
├── skills/              # 200+ 技能模板（SKILL.md 格式）
├── design-systems/      # 151 DESIGN.md 品牌系统
├── design-templates/     # 109 技能包
├── craft/               # 通用品牌无关工艺规则
├── e2e/                 # Playwright UI 自动化测试
├── docs/                # 架构文档、规范、协议说明
├── deploy/              # Docker Compose 部署配置
└── .od/                 # 运行时数据（SQLite、项目、产物）— gitignore
```

---

## 工作原理

### 交互式问卷表单

每个设计简报都以 **`<question-form id="discovery">`** 开头，而不是直接生成代码。表单收集：界面、受众、语气、品牌上下文、规模、约束条件。在模型开始画任何东西之前，先锁定需求方向。

### 五维自评

代理在输出产物之前，会从五个维度对自己进行评分：哲学、层次结构、细节、功能、创新。

### 视觉方向选择器

5 种策划的视觉方向，每种都有确定的 OKLch 调色板和字体栈：
- Editorial Monocle（编辑单片镜）
- Modern Minimal（现代极简）
- Warm Soft（温暖柔和）
- Tech Utility（技术实用）
- Brutalist Experimental（粗野主义实验）

### 产物渲染

代理通过 stdio 流式传输 `<artifact>` 标签，前端解析后在沙箱 iframe（srcdoc）中实时渲染。可导出为 HTML、PDF、PPTX、ZIP、Markdown。

---

## 数据存储

```
.od/
├── app.sqlite                 # projects / conversations / messages / tabs / templates
├── artifacts/                 # "保存到磁盘" 的渲染产物（带时间戳）
└── projects/<id>/            # 每个项目的工件目录，代理的 cwd
```

可通过 `OD_DATA_DIR` 环境变量重新定位存储目录。

---

## 支持的智能体 CLI

| CLI | 命令 | 协议 |
|---|---|---|
| Claude Code | `claude` | claude-stream-json |
| Codex CLI | `codex` | json-event-stream |
| Devin for Terminal | `devin` | acp-json-rpc |
| Cursor Agent | `cursor-agent` | json-event-stream |
| Gemini CLI | `gemini` | json-event-stream |
| OpenCode | `opencode` | json-event-stream |
| Qwen Code | `qwen` | plain |
| Qoder CLI | `qodercli` | qoder-stream-json |
| GitHub Copilot CLI | `copilot` | copilot-stream-json |
| Hermes | `hermes` | acp-json-rpc |
| Kimi CLI | `kimi` | acp-json-rpc |
| Pi | `pi` | pi-rpc |
| Kiro CLI | `kiro-cli` | acp-json-rpc |
| Kilo | `kilo` | acp-json-rpc |
| Mistral Vibe CLI | `vibe` | acp-json-rpc |
| DeepSeek TUI | `deepseek` | plain |

---

## 许可证

Apache-2.0