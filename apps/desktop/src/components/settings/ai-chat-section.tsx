import type { ReactElement } from 'react'
import { CHAT_SYSTEM_PROMPT_MAX_LENGTH, normalizeChatSystemPrompt } from '@reflect/core'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useSettings } from '@/providers/settings-provider'
import { SettingsField } from './field'
import { SettingsSection } from './section'

/** Additional user instructions applied to every AI chat turn. */
export function AiChatSection(): ReactElement {
  const { settings, updateSettings } = useSettings()

  return (
    <SettingsSection id="ai-chat">
      <SettingsField
        legend="System prompt"
        description={`Additional instructions sent with every AI chat (up to ${CHAT_SYSTEM_PROMPT_MAX_LENGTH.toLocaleString()} characters). Reflect’s note-search, citation, and privacy rules still apply.`}
      >
        <Textarea
          aria-label="System prompt"
          value={settings.chatSystemPrompt}
          onChange={(event) => updateSettings({ chatSystemPrompt: event.target.value })}
          onBlur={(event) =>
            updateSettings({ chatSystemPrompt: normalizeChatSystemPrompt(event.target.value) })
          }
          maxLength={CHAT_SYSTEM_PROMPT_MAX_LENGTH}
          rows={6}
          placeholder="Be concise. Challenge my assumptions and ask clarifying questions."
          className="mt-3 min-h-28 resize-y text-sm"
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={normalizeChatSystemPrompt(settings.chatSystemPrompt) === ''}
            onClick={() => updateSettings({ chatSystemPrompt: '' })}
          >
            Use default
          </Button>
        </div>
      </SettingsField>
    </SettingsSection>
  )
}
