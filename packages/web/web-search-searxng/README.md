---
description: "The SearXNG-backed search provider for ctx.web: how deployments mount a local or remote SearXNG instance's JSON API as the web_search backend, with per-search endpoint projection."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-searxng

English | [中文](README.zh.md)

## Summary

With `dsh-web-search-searxng`, the harness searches the web through a SearXNG instance's JSON API (`GET /search?format=json`). Choose it when a deployment runs (or can run) a SearXNG instance — locally in Docker or on a trusted host — and wants one plain HTTP request per search instead of a model turn: no API key, no generated tokens, and results aggregated by the instance from its configured engines. The instance must allow the `json` format (`search.formats`), or the provider fails the call with a structured error that names the setting. The model-facing `web_search` tool lives in `dsh-tool-web`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the provider in a composition that already loads the web service; it registers as the `searxng` search provider, so `ctx.web.search()` resolves it automatically when it is the only usable search backend — or pin it with `searchProvider: searxng`.

### When to choose it

Choose this backend when a deployment wants self-hosted, keyless web search: a SearXNG instance aggregates its configured engines and answers each search with one JSON request. One search costs one HTTP round trip, not a model turn, so latency and token cost stay flat as queries grow. A local Docker instance on the deployment's port series is the intended default; point `baseURL` at any trusted instance.

### Minimal configuration

Load the web service and the provider; the endpoint defaults to `http://127.0.0.1:10000`, the local instance on the deployment's port series, and falls back to `$SEARXNG_BASE_URL` when the field is omitted.

```yaml
- name: '@deepseek-ai/dsh-web'
- name: '@deepseek-ai/dsh-web-search-searxng'
  config:
    baseURL: http://127.0.0.1:10000
```

| Field | Default | Meaning |
|---|---|---|
| `apiToken` | omitted | Optional instance API token sent as `Authorization: Bearer`; a local instance needs none. A non-empty literal wins |
| `baseURL` | `http://127.0.0.1:10000` | Instance endpoint base; `/search` is appended. Falls back to `$SEARXNG_BASE_URL`; an unparseable value makes the provider unavailable |
| `language` | omitted | SearXNG `language` parameter (e.g. `en`, `ru`, `all`). Omitted = instance default |
| `categories` | omitted | SearXNG `categories` parameter (e.g. `general`, `news`). Omitted = instance default |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-web-search-searxng) is the exhaustive source for every accepted field and its JSDoc. The entry above is the base layer of the provider's Settings section; a user layer over it reaches the next search, because the provider projects the section per call rather than capturing it at registration.

### What a search returns

`content` is always omitted: SearXNG's `answers` and `infoboxes` arrays have no home in the seam's result shape, which reserves `content` for generated answers. `sources[]` comes from the response's `results[]` — `url`, `title`, `content` as `snippet`, and `publishedDate` as `publishedAt` — with URL-less entries dropped and the list deduplicated by URL (first wins). Because SearXNG exposes no result-count knob, the service enforces `maxResults` by truncating and flagging.

### Failures and recovery

Failures throw `WebError` with a machine-routable code: caller cancellation is `WEB_ABORTED`, and provider or transport failures are `WEB_PROVIDER_ERROR`. A connection failure names the configured endpoint so a down instance is diagnosable from the error; a 403 adds a hint that the instance may not allow the `json` format. HTTP redirects are rejected before the `Location` target is contacted. The model-facing `web_search` tool surfaces failure text to the model under its own error wrapper.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the provider; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The provider is built on two commitments:

- **One plain HTTP request per search.** SearXNG runs the retrieval server-side and returns a JSON envelope; the provider parses `results[]` and never scrapes. No model turn is involved, so a search costs one round trip regardless of query or result count.
- **The instance is the configuration owner.** Engine selection, language defaults, and rate limiting live in the instance's `settings.yml`; the provider passes at most `q`, `format`, `language`, and `categories`. A deployment that wants different engines changes the instance, not this package.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema, Settings section installation, per-search option projection |
| [`src/provider.ts`](src/provider.ts) | The `SearxngSearchProvider`: endpoint building, request dispatch, response mapping |
| [`src/types.ts`](src/types.ts) | SearXNG wire types for the `format=json` response |
| — | No runtime invariant companion is published; the package emits no session event and owns no authoritative data stream to relate. Request and response contracts are enforced at the provider boundary instead. |

### Request flow

Each search projects the current Settings section into provider options — endpoint, optional token, optional parameters — builds `GET {baseURL}/search?q=…&format=json`, dispatches it with `redirect: 'error'` and the caller's abort signal, and maps the response's `results[]` to deduplicated sources. The service enforces the requested source bound on the way back.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the shared vocabulary to the service, the model-facing tools, and the design rationale.

- [Web subsystem](../../../docs/subsystems/web.md) — the exhaustive search request/result vocabulary and error codes.
- [Web package map](../README.md) — the package family and each role.
- [dsh-web](../web/README.md) — the web service this provider registers into.
- [dsh-tool-web](../tool-web/README.md) — the model-facing `web_search` tool that renders this provider's sources.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-web-search-searxng) — every accepted config field and its source declaration.
- [Web capability seam decision](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md) — why search and fetch share one provider-selection service.

-----

<a id="model-experience"></a>
## Model Experience

### Conversation tool result

#### What the model sees

Through `dsh-tool-web`, the conversation model sees deduplicated URLs, titles, snippets, and dates from the instance's merged result list. This provider's exact failures include the actionable endpoint message, `SearXNG search request failed: <error> (is the instance running at <baseURL>?)`, `SearXNG search aborted`, `SearXNG API error (HTTP <status>)` (with a `search.formats` hint on 403), and `SearXNG returned an unprocessable response body: <error>`; the consumer owns the error wrapper.

#### Token effect

Zero direct conversation tokens from registration. Result tokens scale with returned sources and snippets, then the service enforces the requested source bound.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the provider is expensive or incomplete. They are current package constraints.

- **The instance must allow the json format** — SearXNG ships with `search.formats: [html]`; without `json` every search fails with a 403 that names the setting.
- **A down instance reads as available** — the availability check is a local URL parse per the seam's no-network contract, so a stopped instance fails the search with `WEB_PROVIDER_ERROR` instead of deselecting itself.
- **`answers` and `infoboxes` are not mapped** — the seam's result shape reserves `content` for generated answers, so direct-answer and infobox data stay on the wire and out of the model's sources.
- **Over-returned sources still cost tokens** — with no result-count knob on the wire, `maxResults` is enforced only post-hoc by service truncation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and undecided directions. It is explicitly non-authoritative — shipped behavior, limits, and rationale live in the sections above and the linked Agent Notes.

#### Future: instance health surfacing

A cheap liveness probe (for example the instance's `/healthz`) could turn the down-instance `WEB_PROVIDER_ERROR` into a `WEB_PROVIDER_UNAVAILABLE` selection, but the seam's availability contract forbids network calls, so that is a seam-level change, not a provider one.

</details>
