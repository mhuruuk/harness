---
description: "面向 ctx.web 的 SearXNG 搜索提供方：部署如何通过 SearXNG 实例的 JSON API 挂载 web_search 后端，并按次投影 endpoint。"
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-searxng

[English](README.md) | 中文

## 概述

有了 `dsh-web-search-searxng`，harness 通过 SearXNG 实例的 JSON API（`GET /search?format=json`）检索 web。当部署运行（或可以运行）一个 SearXNG 实例——本地 Docker 或受信任主机——并且希望每次搜索只花一个普通 HTTP 请求而不是一整个 model turn 时选择它：不需要 API 密钥，不消耗生成 token，结果由实例从其配置的引擎聚合而来。实例必须允许 `json` 格式（`search.formats`），否则提供方以指明该设置的结构性错误失败。面向模型的 `web_search` 工具位于 `dsh-tool-web`。

## 目录

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

在已加载 web 服务的 composition 中挂载该提供方；它注册为 `searxng` 搜索提供方，因此当它是唯一可用的搜索后端时 `ctx.web.search()` 会自动解析它——或者用 `searchProvider: searxng` 固定它。

### 何时选择

当部署想要自托管、无密钥的 web 搜索时选择此后端：SearXNG 实例聚合其配置的引擎，并以一个 JSON 请求回答每次搜索。一次搜索只花一个 HTTP 往返而非 model turn，因此延迟和 token 成本不随查询增长。部署端口序列上的本地 Docker 实例是预期默认值；`baseURL` 可以指向任何受信任实例。

### 最小配置

加载 web 服务与提供方；endpoint 默认为 `http://127.0.0.1:10000`（部署端口序列上的本地实例），字段缺省时回退到 `$SEARXNG_BASE_URL`。

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-searxng'
  config:
    baseURL: http://127.0.0.1:10000
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `apiToken` | 省略 | 可选的实例 API 令牌，以 `Authorization: Bearer` 发送；本地实例无需令牌。非空字面值优先 |
| `baseURL` | `http://127.0.0.1:10000` | 实例 endpoint 基址；追加 `/search`。回退到 `$SEARXNG_BASE_URL`；无法解析的值使提供方不可用 |
| `language` | 省略 | SearXNG `language` 参数（如 `en`、`ru`、`all`）。省略 = 实例默认 |
| `categories` | 省略 | SearXNG `categories` 参数（如 `general`、`news`）。省略 = 实例默认 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-searxng)是每个受支持字段及其 JSDoc 的穷尽式真源。上面的条目是提供方 Settings 段的 base 层；叠加其上的 user 层作用于下一次搜索，因为提供方按次投影该段，而不是在注册时固化它。

### 搜索返回什么

`content` 始终省略：SearXNG 的 `answers` 与 `infoboxes` 数组在 seam 的结果形状中没有归宿，该形状将 `content` 保留给生成的答案。`sources[]` 来自响应的 `results[]`——`url`、`title`、`content` 作为 `snippet`、`publishedDate` 作为 `publishedAt`——无 URL 的条目被丢弃，列表按 URL 去重（首个胜出）。由于 SearXNG 没有结果数旋钮，服务通过截断并置标志来强制 `maxResults`。

### 失败与恢复

失败抛出带机器可路由代码的 `WebError`：调用方取消是 `WEB_ABORTED`，提供方或传输失败是 `WEB_PROVIDER_ERROR`。连接失败会指明配置的 endpoint，使停机的实例可从错误中诊断；403 会追加实例可能未允许 `json` 格式的提示。HTTP 重定向在接触 `Location` 目标之前被拒绝。面向模型的 `web_search` 工具在自身错误包装下向模型呈现失败文本。

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

本节解释提供方背后的设计决策；可观察行为已完整覆盖于[使用本包](#use-this-package)。

### 设计哲学

该提供方建立在两个承诺之上：

- **每次搜索一个普通 HTTP 请求。** SearXNG 在服务端执行检索并返回 JSON 信封；提供方解析 `results[]`，绝不抓取。不涉及 model turn，因此无论查询或结果数量如何，一次搜索只花一个往返。
- **实例是配置所有者。** 引擎选择、语言默认值与限流都位于实例的 `settings.yml`；提供方至多传递 `q`、`format`、`language` 与 `categories`。想要不同引擎的部署修改实例，而非本包。

### Source map

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：配置 schema、Settings 段安装、按次选项投影 |
| [`src/provider.ts`](src/provider.ts) | `SearxngSearchProvider`：endpoint 构建、请求分发、响应映射 |
| [`src/types.ts`](src/types.ts) | `format=json` 响应的 SearXNG wire 类型 |
| — | 不发布运行时 invariant 伴生；该包不发出会话事件，也不拥有可供关联的权威数据流。请求与响应契约改在提供方边界强制。 |

### Request flow

每次搜索将当前 Settings 段投影为提供方选项——endpoint、可选令牌、可选参数——构建 `GET {baseURL}/search?q=…&format=json`，以 `redirect: 'error'` 与调用方的 abort 信号分发，并将响应的 `results[]` 映射为去重后的 sources。服务在返回路径上强制请求的 source 上限。

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

当包级契约不够时阅读这些页面。它们从共享词汇走向服务、面向模型的工具与设计理由。

- [Web 子系统](../../../docs/subsystems/web.zh.md) — 穷尽的搜索请求/结果词汇与错误代码。
- [Web 包图](../README.zh.md) — 包家族与每个角色。
- [dsh-web](../web/README.zh.md) — 该提供方注册进去的 web 服务。
- [dsh-tool-web](../tool-web/README.zh.md) — 渲染该提供方 sources 的面向模型 `web_search` 工具。
- [生成的配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-web-search-searxng) — 每个受支持配置字段及其源声明。
- [Web capability seam 决策](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.zh.md) — 为什么 search 与 fetch 共享一个提供方选择服务。

-----

<a id="model-experience"></a>
## Model Experience

### Conversation tool result

#### 模型看到什么

通过 `dsh-tool-web`，会话模型看到实例合并结果列表中经去重的 URL、标题、摘要与日期。该提供方的确切失败包括可操作的 endpoint 消息、`SearXNG search request failed: <error> (is the instance running at <baseURL>?)`、`SearXNG search aborted`、`SearXNG API error (HTTP <status>)`（403 时带 `search.formats` 提示）与 `SearXNG returned an unprocessable response body: <error>`；错误包装归消费者所有。

#### Token effect

注册不产生直接的会话 token。结果 token 随返回的 sources 与摘要增长，随后服务强制请求的 source 上限。

#### KV Cache effect

Append-only；新可见内容跟随可复用的请求前缀，不会使现有 KV-cache 条目失效。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了该提供方昂贵或不完整的时机。它们是当前的包约束。

- **实例必须允许 json 格式** — SearXNG 出厂为 `search.formats: [html]`；没有 `json` 时每次搜索都以指明该设置的 403 失败。
- **停机实例读作可用** — 按 seam 的无网络契约，可用性检查是本地 URL 解析，因此停止的实例以 `WEB_PROVIDER_ERROR` 使搜索失败，而不是自我取消选择。
- **`answers` 与 `infoboxes` 不映射** — seam 的结果形状将 `content` 保留给生成的答案，因此直接答案与 infobox 数据留在 wire 上、在模型 sources 之外。
- **超额返回的 sources 仍消耗 token** — wire 上没有结果数旋钮，`maxResults` 只能事后由服务截断强制。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>Working context for maintainers — click to expand</summary>

本 Dev Note 是维护者的工作上下文：开放问题与未决方向。它明确不具权威性——已发布行为、限制与理由位于上文各节及链接的 Agent Notes。

#### Future: instance health surfacing

廉价的存活探测（例如实例的 `/healthz`）可以把停机实例的 `WEB_PROVIDER_ERROR` 变为 `WEB_PROVIDER_UNAVAILABLE` 选择，但 seam 的可用性契约禁止网络调用，因此那是 seam 级变更而非提供方级变更。

</details>
