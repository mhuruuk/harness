# Agent Note: 以 SearXNG 作为出厂默认 web 搜索

Status: implemented

[English](2026-09-05-searxng-default-search.md) | 中文

本决策取代[出厂组合中的默认 Web 搜索](2026-07-31-web-default-search.zh.md)中的默认搜索提供方及其凭据解析。该记录继续拥有显式提供方 id 选择、出厂 60 秒搜索预算，以及提供方可用性与模型工具注册之间的分离。本决策同时取代[web 设置页中的插件配置](2026-08-10-web-plugin-configuration.zh.md)中 Web 搜索卡片的 credentials 域写路径：token 现在作为被脱敏的 secret 落入提供方自己的 settings 段。

## 问题

出厂默认搜索提供方每次搜索消耗一次辅助模型调用：`dsh-web-search-deepseek` 发起一次带原生搜索 server tool 的 DeepSeek Messages 请求，因此每次 `web_search` 在延迟与 token 上都花费一个完整模型轮次，且搜索密钥复用会话适配器同样解析的 `DEEPSEEK_API_KEY` 凭据引用。运行本地元搜索引擎的部署无法在不自行提供提供方与 overlay 的情况下，得到一个无密钥、无辅助轮次的可固定搜索。

## 决策

`packages/bundle/base/cordis.patch.yml` 挂载 `dsh-web-search-searxng` 取代 `dsh-web-search-deepseek`，并固定 `searchProvider: searxng`。每次搜索是一次对部署本地 SearXNG 实例的纯 JSON 请求（`GET /search?format=json`）——默认 `http://127.0.0.1:10000`，可经 `SEARXNG_BASE_URL` 环境变量、提供方的 `baseURL` 设置或 Web 搜索卡片覆盖——无需 API 密钥，也无需辅助模型轮次。实例必须启用 `json` 格式；否则搜索以 403 失败并指明该设置。

`dsh-web-search-deepseek` 作为 opt-in 提供方保留在仓库中，与 `dsh-web-search-exa`、`dsh-web-search-perplexity` 对称：需要 DeepSeek 原生搜索的部署自行挂载该行并固定 `searchProvider: deepseek-official`。base 组合不再携带该行，因此 base 支撑的部署在自行添加之前完全没有 DeepSeek 搜索。

设置 > 插件 > 插件配置中的 Web 搜索卡片编辑 `web-search-searxng` 命名空间：实例 `baseURL`、`language`、`categories` 为普通字段，可选 `apiToken` 为只写 secret。卡片从 settings 的 `secrets` 侧车报告 token 是否已配置，从不渲染其值；空白草稿保留已存 token。卡片的 slot key 跟随命名空间，因此台账、派发与测试都以 `web-search-searxng` 为键。

出厂 60 秒搜索预算与提供方中立的 30 秒工具默认值，仍由[出厂组合中的默认 Web 搜索](2026-07-31-web-default-search.zh.md)记录拥有。

## 考虑过的替代方案

**保留 DeepSeek 原生搜索为出厂默认。** 被否决：一次搜索花费一个完整辅助模型轮次的延迟与 token，而无密钥的本地实例用一次 HTTP 请求即可回答同样的 `web_search` 调用。该提供方仍作为 opt-in 行保留，供偏好它的部署使用。

**从仓库中删除 `dsh-web-search-deepseek`。** 被否决：该包是带完整测试覆盖的可用提供方，删除它迫使重新录制固定其端点引导行为的快照与 e2e 夹具。保留为 opt-in 只花一行目录条目，对 base 支撑的部署运行时零成本。

**像 DeepSeek 卡片那样把 SearXNG token 走 credentials 域。** 被否决，改用 settings secret：token 属于提供方自己的段，被脱敏的 `z.string().role('secret')` 字段走 `secrets` 侧车而非任何 `describe` 值，卡片因此失去第二条写路径与 `credentials/reference-updated` 监听器。[插件配置记录](2026-08-10-web-plugin-configuration.zh.md)记载了最初的 credentials 域选择与本次取代。

## 后果

base 支撑的部署的 `web_search` 以一次 JSON 请求、无密钥、无辅助模型轮次到达本地 SearXNG 实例。实例停摆时，调用以可操作的端点消息失败而非自行取消选择，因为 `available()` 依 seam 的无网络契约保持本地 URL 解析。Web 搜索卡片可从浏览器编辑实例端点、语言、分类与可选 token，token 只写、其配置状态从 `secrets` 侧车读取。DeepSeek、Exa、Perplexity 提供方保持 opt-in 行；`web-search-round` e2e 与端点引导快照仍通过各自脚手架挂载该行来固定 DeepSeek 路径。
