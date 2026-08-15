import type { QuickPhrase } from '../../types'
import type { PromptLibraryTab } from '../../store'

type Props = {
  quickPhrases: QuickPhrase[]
  onAppendPhrase: (id: string) => void
  onOpenLibrary: (tab: PromptLibraryTab) => void
}

/**
 * 输入框下方的快捷短语 chips。
 * 点击是「追加」语义，不会覆盖已写内容；提示词库入口在参数面板「数量」右侧。
 */
export default function PromptQuickBar({ quickPhrases, onAppendPhrase, onOpenLibrary }: Props) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar py-0.5">
      {quickPhrases.length === 0 ? (
        <button
          type="button"
          onClick={() => onOpenLibrary('quick')}
          className="shrink-0 rounded-full px-2 py-1 text-xs text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          添加快捷短语
        </button>
      ) : (
        <>
          {quickPhrases.map((phrase) => (
            <button
              key={phrase.id}
              type="button"
              onClick={() => onAppendPhrase(phrase.id)}
              title={phrase.text}
              className="shrink-0 rounded-full border border-gray-200/70 bg-white/50 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
            >
              {phrase.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onOpenLibrary('quick')}
            className="shrink-0 rounded-full px-2 py-1 text-xs text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            aria-label="管理快捷短语"
          >
            管理
          </button>
        </>
      )}
    </div>
  )
}