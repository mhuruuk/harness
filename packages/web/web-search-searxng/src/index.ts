/**
 * Register a SearXNG-backed provider in `ctx.web`. It calls the instance's JSON search API
 * (`GET /search?format=json`) — one plain HTTP request per search, no model turn, and no
 * credential requirement for a local instance.
 * @module @deepseek-ai/dsh-web-search-searxng
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-web'
import {
  SearxngSearchProvider,
  SEARXNG_DEFAULT_BASE_URL,
} from './provider.ts'
import type { SearxngSearchProviderOptions } from './provider.ts'

export {
  SearxngSearchProvider,
  SEARXNG_DEFAULT_BASE_URL,
  SEARXNG_PROVIDER_ID,
} from './provider.ts'
export type { SearxngSearchProviderOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-searxng'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** Optional instance API token; sent as a Bearer header. A local instance needs none. */
  apiToken?: string
  /** Instance endpoint base; `/search` is appended. */
  baseURL?: string
  /** SearXNG `language` parameter (e.g. `en`, `ru`, `all`). Omitted = instance default. */
  language?: string
  /** SearXNG `categories` parameter (e.g. `general`, `news`). Omitted = instance default. */
  categories?: string
}

export const Config: z<Config> = z.object({
  apiToken: z.string().role('secret'),
  // Declared here rather than only at the use site: a configuration surface
  // renders the resolved section, so a default the schema does not carry reads
  // there as no value at all.
  baseURL: z.string(),
  language: z.string(),
  categories: z.string(),
})

/**
 * Environment variable naming this provider's endpoint.
 */
const SEARCH_BASE_URL_ENV = 'SEARXNG_BASE_URL'

/** Settings namespace carrying this provider's endpoint and optional token. */
export const WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE = 'web-search-searxng'

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider:
 * every value it reads is already fully defaulted.
 * @param ctx - plugin context supplying the environment plane.
 * @param config - the currently authoritative section.
 * @returns options for one search.
 */
function resolveOptions(ctx: Context, config: Config): SearxngSearchProviderOptions {
  return {
    ...config.apiToken !== undefined && config.apiToken.length > 0 ? { apiToken: config.apiToken } : {},
    baseURL: config.baseURL
      ?? launchEnvironmentOf(ctx).get(SEARCH_BASE_URL_ENV)?.value
      ?? SEARXNG_DEFAULT_BASE_URL,
    ...config.language !== undefined && config.language.length > 0 ? { language: config.language } : {},
    ...config.categories !== undefined && config.categories.length > 0 ? { categories: config.categories } : {},
  }
}

/** Register the SearXNG search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE, Config, config, {
      setSource: (source) => {
        current = source
      },
      // The registration carries no resolved value: the provider projects the
      // section per search, so a committed change needs no re-registration.
      onChange: () => {},
    })
  })
  ctx.web.registerSearchProvider(new SearxngSearchProvider(() => resolveOptions(ctx, current())))
}
