# Agent Note: SearXNG as the shipped default web search

Status: implemented

English | [中文](2026-09-05-searxng-default-search.zh.md)

This decision supersedes the default search provider and its credential resolution in [Default Web search in shipped compositions](2026-07-31-web-default-search.md). That record continues to own the explicit provider-id selection, the shipped 60-second search budget, and the separation between provider availability and model-tool registration. It also supersedes the Web search card's credentials-domain write path in [Plugin configuration in the web settings page](2026-08-10-web-plugin-configuration.md), whose token now lands in the provider's own settings section as a redacted secret.

## Problem

The shipped default search provider consumed one auxiliary model call per search: `dsh-web-search-deepseek` issues a DeepSeek Messages request with the native search server tool, so every `web_search` costs a full model turn in latency and tokens, and the search key rides the shared `DEEPSEEK_API_KEY` credential reference that the conversation adapter also resolves. A deployment that runs a local metasearch instance had no keyless, auxiliary-turn-free search to pin without supplying its own provider and overlay.

## Decision

`packages/bundle/base/cordis.patch.yml` mounts `dsh-web-search-searxng` instead of `dsh-web-search-deepseek` and pins `searchProvider: searxng`. Each search is one plain JSON request (`GET /search?format=json`) to the deployment's local SearXNG instance — default `http://127.0.0.1:10000`, overridable through the `SEARXNG_BASE_URL` environment variable, the provider's `baseURL` setting, or the Web search card — with no API key and no auxiliary model turn. The instance must enable the `json` format; without it the search fails with a 403 that names the setting.

`dsh-web-search-deepseek` remains in the repository as an opt-in provider, symmetric with `dsh-web-search-exa` and `dsh-web-search-perplexity`: a deployment that wants DeepSeek native search mounts the row and pins `searchProvider: deepseek-official`. The base composition no longer carries the row, so a base-backed deployment has no DeepSeek search at all until it adds one.

The Web search card in Settings > Plugins > Plugin configuration edits the `web-search-searxng` namespace: the instance `baseURL`, `language`, and `categories` as plain fields, and the optional `apiToken` as a write-only secret. The card reports whether a token is configured from the settings `secrets` sidecar and never renders the value; a blank draft keeps the stored token. The card's slot key follows the namespace, so the ledger, the dispatch, and the tests all key on `web-search-searxng`.

The shipped 60-second search budget and the provider-neutral 30-second tool default remain as the [Default Web search in shipped compositions](2026-07-31-web-default-search.md) record owns them.

## Alternatives considered

**Keep DeepSeek native search as the shipped default.** Rejected because one search costs a full auxiliary model turn in latency and tokens, while the keyless local instance answers the same `web_search` call with one HTTP request. The provider stays available as an opt-in row for deployments that prefer it.

**Delete `dsh-web-search-deepseek` from the repository.** Rejected because the package is a working provider with full test coverage, and its removal would force re-recording the snapshots and e2e fixtures that pin its endpoint-guidance behavior. Keeping it opt-in costs one catalog row and nothing at runtime for base-backed deployments.

**Route the SearXNG token through the credentials domain, as the DeepSeek card did.** Rejected in favor of the settings secret: the token belongs to the provider's own section, the redacted `z.string().role('secret')` field rides the `secrets` sidecar instead of any `describe` value, and the card loses its second write path and its `credentials/reference-updated` listener. The [plugin configuration note](2026-08-10-web-plugin-configuration.md) records the original credentials-domain choice and this supersession.

## Consequences

A base-backed deployment's `web_search` reaches the local SearXNG instance with one JSON request, no key, and no auxiliary model turn. A stopped instance fails the call with an actionable endpoint message instead of deselecting itself, because `available()` stays a local URL parse per the seam's no-network contract. The Web search card edits the instance endpoint, language, categories, and an optional token from the browser, with the token write-only and its configured state read from the `secrets` sidecar. The DeepSeek, Exa, and Perplexity providers remain opt-in rows; the `web-search-round` e2e and the endpoint-guidance snapshot still pin the DeepSeek path by mounting the row through their scaffolds.
