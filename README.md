# Copilot API 代理

> [!WARNING]
> 这是对 GitHub Copilot API 的逆向代理，GitHub 官方不支持，可能随时失效，使用风险自负。

> [!WARNING]
> **GitHub 安全提示：**  
> 过度或批量自动化调用 Copilot（如频繁脚本/工具请求）会触发 GitHub 滥用检测。  
> 你可能收到安全警告，继续异常行为可能导致 Copilot 访问被暂时封禁。  
> GitHub 禁止对其基础设施造成异常负载的批量自动化活动。  
>
> 请阅读：  
> - [GitHub 可接受使用政策](https://docs.github.com/site-policy/acceptable-use-policies/github-acceptable-use-policies#4-spam-and-inauthentic-activity)  
> - [GitHub Copilot 条款](https://docs.github.com/site-policy/github-terms/github-terms-for-additional-products-and-features#github-copilot)  
> 请理性使用此代理，避免账号受限。

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/E1E519XS7W)

---

**提示：** 如果你使用 [opencode](https://github.com/sst/opencode)，无需本项目；opencode 已内置 GitHub Copilot provider。

---

## 项目概览

将 GitHub Copilot API 反向代理成 OpenAI/Anthropic 兼容服务，可直接被支持 OpenAI Chat Completions API 或 Anthropic Messages API 的工具使用，包括驱动 [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)。

## 功能特性

- **OpenAI & Anthropic 兼容**：暴露 `/v1/chat/completions`、`/v1/models`、`/v1/embeddings` 与 `/v1/messages`。
- **Claude Code 集成**：通过 `--claude-code` 旗标一键生成配置并复制到剪贴板。
- **用量看板**：网页仪表盘查看 Copilot 配额、用量与明细。
- **限速控制**：`--rate-limit` 与 `--wait` 防止频率过高；`--manual` 人工批准每次请求。
- **多账号池化**：可添加多个 Copilot 账号，首条请求随机选取账号，会话内粘滞使用同一账号。
- **令牌可见性**：`--show-token` 可在获取与刷新时显示 GitHub/Copilot token。
- **灵活认证**：交互式登录或直接提供 GitHub Token，适合 CI/CD。
- **多类型账号**：支持个人、商用、企业 Copilot 计划。

## 演示

https://github.com/user-attachments/assets/7654b383-669d-4eb9-b23c-06d7aefee8c5

## 前置条件

- Bun (>= 1.2.x)
- 具有 Copilot 订阅的 GitHub 账号（个人/商用/企业）

## 安装依赖

```sh
bun install
```

## Docker 使用

构建镜像

```sh
docker build -t copilot-api .
```

运行容器

```sh
# 创建宿主机目录保存 GitHub token 等数据
mkdir -p ./copilot-data

# 绑定挂载以持久化 token，防止容器重启丢失认证
docker run -p 4141:4141 -v $(pwd)/copilot-data:/root/.local/share/copilot-api copilot-api
```

> **注意：** GitHub token 与相关数据会保存在宿主的 `copilot-data`，容器内映射到 `/root/.local/share/copilot-api`，重启不丢失。

### 使用环境变量注入 Token

```sh
# 构建时注入
docker build --build-arg GH_TOKEN=your_github_token_here -t copilot-api .

# 运行时注入
docker run -p 4141:4141 -e GH_TOKEN=your_github_token_here copilot-api

# 带其他启动参数
docker run -p 4141:4141 -e GH_TOKEN=your_token copilot-api start --verbose --port 4141
```

### Docker Compose 示例

```yaml
version: "3.8"
services:
  copilot-api:
    build: .
    ports:
      - "4141:4141"
    environment:
      - GH_TOKEN=your_github_token_here
    restart: unless-stopped
```

镜像特点：多阶段构建、非 root 运行、健康检查、基础镜像固定版本。

## npx 直接运行

```sh
npx copilot-api@latest start
```

指定端口示例：

```sh
npx copilot-api@latest start --port 8080
```

仅执行认证：

```sh
npx copilot-api@latest auth
```

## 命令结构

- `start`：启动服务，必要时自动完成认证。
- `auth`：单独执行 GitHub 认证，常用于生成 `--github-token` 所需的 Token。
- `add-account`：使用设备码登录再添加一个账户到账号池。
- `check-usage`：在终端查看 Copilot 用量/配额（无需启动服务）。
- `debug`：输出版本、运行时、路径、Token 状态等调试信息。

## 命令行选项

### `start` 选项

| 选项           | 说明                                                          | 默认值     | 别名 |
| -------------- | ------------------------------------------------------------- | ---------- | ---- |
| --port         | 监听端口                                                      | 4141       | -p   |
| --verbose      | 开启详细日志                                                  | false      | -v   |
| --account-type | 账号类型（individual, business, enterprise）                  | individual | -a   |
| --manual       | 开启人工批准模式                                              | false      | 无   |
| --rate-limit   | 请求间隔秒数                                                  | none       | -r   |
| --wait         | 触发限速时等待而非报错                                        | false      | -w   |
| --github-token | 直接提供 GitHub Token（需通过 `auth` 子命令生成）             | none       | -g   |
| --claude-code  | 生成启动 Claude Code 的环境变量命令                           | false      | -c   |
| --show-token   | 在获取/刷新时显示 GitHub 与 Copilot Token                     | false      | 无   |
| --proxy-env    | 从环境变量初始化代理                                          | false      | 无   |

### `auth` 选项

| 选项           | 说明                      | 默认值     | 别名 |
| -------------- | ------------------------- | ---------- | ---- |
| --verbose      | 开启详细日志              | false      | -v   |
| --show-token   | 登录后显示 GitHub Token   | false      | 无   |
| --account-type | 新账号类型（individual, business, enterprise） | individual | -a |

### `debug` 选项

| 选项   | 说明                 | 默认值 | 别名 |
| ------ | -------------------- | ------ | ---- |
| --json | 以 JSON 输出调试信息 | false  | 无   |

## 多账号用法

- 通过 `npx copilot-api add-account` 交互式添加账号；旧的 `auth` 也会添加账号。账号信息保存在 `~/.local/share/copilot-api/accounts.json`（首次会自动导入历史 `github_token`）。
- 服务单端口运行并维护账号池。每次会话首次请求随机选取账号，后续同一会话粘滞使用同一账号。会话键优先 `X-Conversation-Id`，否则使用 OpenAI payload 的 `user` 或 Anthropic 的 `metadata.user_id`；未提供键时每次请求可能选择不同账号。
- `GET /usage` 默认取第一个账号，可传 `X-Account-Id` 选择指定账号。

## API 接口

### OpenAI 兼容

| 路径                        | 方法 | 说明       |
| --------------------------- | ---- | ---------- |
| `POST /v1/chat/completions` | POST | 返回对话回复 |
| `GET /v1/models`            | GET  | 列出可用模型 |
| `POST /v1/embeddings`       | POST | 生成文本向量 |

### Anthropic 兼容

| 路径                           | 方法 | 说明          |
| ------------------------------ | ---- | ------------- |
| `POST /v1/messages`            | POST | 创建对话回复  |
| `POST /v1/messages/count_tokens` | POST | 计算消息 Token 数 |

### 用量监控

| 路径        | 方法 | 说明                     |
| ----------- | ---- | ------------------------ |
| `GET /usage` | GET | 获取 Copilot 用量/配额   |
| `GET /token` | GET | 返回当前账号的 Copilot Token 列表 |

## 使用示例（npx）

```sh
# 基础启动
npx copilot-api@latest start

# 自定义端口与 verbose
npx copilot-api@latest start --port 8080 --verbose

# 使用商用/企业账号
npx copilot-api@latest start --account-type business
npx copilot-api@latest start --account-type enterprise

# 开启人工批准
npx copilot-api@latest start --manual

# 设置 30 秒限速
npx copilot-api@latest start --rate-limit 30

# 触发限速时等待
npx copilot-api@latest start --rate-limit 30 --wait

# 直接提供 GitHub Token
npx copilot-api@latest start --github-token ghp_YOUR_TOKEN_HERE

# 仅执行认证
npx copilot-api@latest auth
npx copilot-api@latest auth --verbose

# 查看用量/配额
npx copilot-api@latest check-usage

# 调试信息
npx copilot-api@latest debug
npx copilot-api@latest debug --json

# 使用环境代理
npx copilot-api@latest start --proxy-env
```

## 用量看板

启动服务后，控制台会输出用量看板链接，例如：  
`https://ericc-ch.github.io/copilot-api?endpoint=http://localhost:4141/usage`。若在 Windows 使用 `start.bat` 会自动打开。

- **API Endpoint URL**：默认从 URL 查询参数读取，可改成任意兼容端点。
- **Fetch**：点击刷新用量数据，页面加载时自动拉取。
- **Usage Quotas**：按 Chat/Completions 等分类展示进度条。
- **Detailed Information**：显示完整 JSON 明细。
- **URL 参数配置**：可直接在 URL 传入 `endpoint`，便于书签或分享，如 `https://ericc-ch.github.io/copilot-api?endpoint=http://your-api-server/usage`。

## 搭配 Claude Code

### 交互式（`--claude-code`）

```sh
npx copilot-api@latest start --claude-code
```

按提示选择主模型与小模型，命令会复制到剪贴板，直接在新终端粘贴启动 Claude Code。

### 手动配置 `.claude/settings.json`

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:4141",
    "ANTHROPIC_AUTH_TOKEN": "dummy",
    "ANTHROPIC_MODEL": "gpt-4.1",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "gpt-4.1",
    "ANTHROPIC_SMALL_FAST_MODEL": "gpt-4.1",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "gpt-4.1",
    "DISABLE_NON_ESSENTIAL_MODEL_CALLS": "1",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"
  },
  "permissions": {
    "deny": [
      "WebSearch"
    ]
  }
}
```

更多配置见官方文档：  
- 设置项：https://docs.anthropic.com/en/docs/claude-code/settings#environment-variables  
- IDE 集成：https://docs.anthropic.com/en/docs/claude-code/ide-integrations

## 源码运行

开发模式

```sh
bun run dev
```

生产模式

```sh
bun run start
```

## 使用建议

- 避免触发 Copilot 限速：  
  - `--manual`：人工批准每次请求。  
  - `--rate-limit <seconds>`：设置请求间隔，如 `copilot-api start --rate-limit 30`。  
  - `--wait`：配合限速，在冷却结束前等待而非报错，适合客户端无自动重试场景。  
- 若使用商用/企业账号，请传 `--account-type`（如 `--account-type business`）。官方说明见：  
  https://docs.github.com/en/enterprise-cloud@latest/copilot/managing-copilot/managing-github-copilot-in-your-organization/managing-github-copilot-access-to-your-organizations-network#configuring-copilot-subscription-based-network-routing-for-your-enterprise-or-organization
