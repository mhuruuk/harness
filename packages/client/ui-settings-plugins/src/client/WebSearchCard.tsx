/**
 * The web-search provider's card: the SearXNG instance's endpoint, language
 * hint, and engine categories, plus the instance token — which the wire
 * redacts from the section, so the card reports only whether one is
 * configured and writes the literal on save.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SecretField, ValueField } from './fields.tsx'
import { PluginCard } from './PluginCard.tsx'
import type { WebSearchCardFace } from './web-search-card-controller.ts'
import type {} from './slot-contract.ts'

/** Props the renderer binds for the web-search card. */
export type WebSearchCardProps =
  PropsRuntime<'settings.plugin.item'>
  & PropsLocale<'settings.plugins'>
  & InjectFace<WebSearchCardFace>

/**
 * Render the web-search card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card.
 */
export function WebSearchCard(props: WebSearchCardProps) {
  const { t } = props
  const state = props.useWebSearchCard(snapshot => snapshot)
  const disabled = !state.writable
  return (
    <PluginCard
      t={t}
      titleKey="webSearchTitle"
      descriptionKey="webSearchDescription"
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <SecretField
        id="plugin-config-web-search-token"
        label={t('webSearchApiToken')}
        hint={t('webSearchApiTokenHint')}
        disabled={disabled}
        text={state.apiToken.text}
        configured={state.apiTokenConfigured}
        stateLabel={state.apiTokenConfigured ? t('webSearchApiTokenSet') : t('webSearchApiTokenUnset')}
        onEdit={(text) => { props.edit('apiToken', text) }}
      />
      <ValueField
        id="plugin-config-web-search-endpoint"
        label={t('webSearchBaseUrl')}
        hint={t('webSearchBaseUrlHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={disabled}
        {...state.baseURL}
        onEdit={(text) => { props.edit('baseURL', text) }}
        onReset={() => { props.resetField('baseURL') }}
      />
      <ValueField
        id="plugin-config-web-search-language"
        label={t('webSearchLanguage')}
        hint={t('webSearchLanguageHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={disabled}
        {...state.language}
        onEdit={(text) => { props.edit('language', text) }}
        onReset={() => { props.resetField('language') }}
      />
      <ValueField
        id="plugin-config-web-search-categories"
        label={t('webSearchCategories')}
        hint={t('webSearchCategoriesHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidNumber')}
        disabled={disabled}
        {...state.categories}
        onEdit={(text) => { props.edit('categories', text) }}
        onReset={() => { props.resetField('categories') }}
      />
    </PluginCard>
  )
}
