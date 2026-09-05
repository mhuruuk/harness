/**
 * The web-search card's staged form over the `web-search-searxng` settings
 * namespace.
 *
 * The token is the one control that does not render a stored value: the wire
 * redacts it from the section, so the card learns only whether one is
 * configured — from the descriptor's secret sidecar — and writes the literal
 * into the section on save. It is still staged with the rest of the form, so
 * one save covers everything the card shows.
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  SettingsDescribeFace, SettingsScope,
} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  CardForm, textField,
  type CardActions, type CardFieldState, type CardShell,
} from './card-form.ts'

/**
 * Namespace of the SearXNG search provider. Spelled here rather than
 * imported: a client package must not depend on a Host package.
 */
export const WEB_SEARCH_NS = 'web-search-searxng'

/** Form field the token control stages under. */
const API_TOKEN_FIELD = 'apiToken'

/** The search-provider fields this card edits. */
export interface WebSearchSettings {
  /** Instance token; the wire redacts it, so the card only reports its presence. */
  apiToken?: string
  /** Instance base URL; blank inherits the provider default. */
  baseURL?: string
  /** Query language hint passed to the instance. */
  language?: string
  /** Comma-separated engine categories. */
  categories?: string
}

/** What the web-search card renders. */
export interface WebSearchCardState extends CardShell {
  /** Instance base URL. */
  baseURL: CardFieldState
  /** Query language hint. */
  language: CardFieldState
  /** Engine categories. */
  categories: CardFieldState
  /** The staged token, which starts blank on every load. */
  apiToken: CardFieldState
  /** Whether the Host reports a token configured for the section. */
  apiTokenConfigured: boolean
}

/** The registration-side face the web-search card's slot entry injects. */
export interface WebSearchCardFace extends CardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useWebSearchCard. */
    webSearchCard: SnapshotStore<WebSearchCardState>
  }
}

/** Bridges the `web-search-searxng` scope and its secret sidecar onto the card. */
export class WebSearchCardController {
  private readonly form: CardForm<WebSearchSettings>
  private readonly store: SnapshotStore<WebSearchCardState>
  private tokenConfigured = false

  /**
   * @param scope - the bound settings scope for the `web-search-searxng` namespace.
   * @param describe - the shared describe face, whose namespace view carries
   * the redaction sidecar the bound scope does not.
   */
  constructor(
    private readonly scope: SettingsScope<WebSearchSettings>,
    private readonly describe: SettingsDescribeFace,
  ) {
    this.form = new CardForm(
      scope,
      [textField('baseURL'), textField('language'), textField('categories')],
      [{ field: API_TOKEN_FIELD, write: text => this.writeToken(text) }],
    )
    this.store = this.form.bind(() => this.projection())
    this.describe.subscribe(() => { this.syncTokenState() })
    this.syncTokenState()
  }

  private projection(): WebSearchCardState {
    return {
      ...this.form.shell(),
      baseURL: this.form.field('baseURL'),
      language: this.form.field('language'),
      categories: this.form.field('categories'),
      apiToken: this.form.field(API_TOKEN_FIELD),
      apiTokenConfigured: this.tokenConfigured,
    }
  }

  /**
   * Re-read the secret sidecar after the mirror moves.
   *
   * The token can be written from somewhere else — a settings document edit —
   * and the redacted section value does not change when it is, so without
   * this the badge keeps reporting a state the Host already replaced.
   */
  private syncTokenState(): void {
    const set = this.tokenSet()
    if (set === this.tokenConfigured) return
    this.tokenConfigured = set
    this.store.set(this.projection())
  }

  /**
   * Build the face the card's slot registration injects.
   * @returns the card's snapshot and its form actions.
   */
  inject(): WebSearchCardFace {
    return { hooks: { webSearchCard: this.store }, ...this.form.actions() }
  }

  /**
   * Write the staged token into the section, then report whether the Host
   * holds one.
   *
   * The Host is the only authority on whether the token now exists: the
   * write answer folds its sidecar into the mirror before this returns, so
   * the read-back is the committed state.
   * @param value - the staged token literal.
   * @returns whether the Host reports a configured token afterwards.
   */
  private async writeToken(value: string): Promise<boolean> {
    await this.scope.set(API_TOKEN_FIELD, value)
    return this.tokenSet()
  }

  /**
   * Whether the section's redaction sidecar reports a token value.
   * @returns the sidecar's `set` flag for the token position.
   */
  private tokenSet(): boolean {
    const view = this.describe.getSnapshot().view
    return view?.namespaces
      .find(row => row.ns === WEB_SEARCH_NS)
      ?.secrets.find(secret => secret.path[0] === API_TOKEN_FIELD)
      ?.set ?? false
  }
}
