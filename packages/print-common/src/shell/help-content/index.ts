// 帮助文档章节：逐字复制自 print-canvas/src/help-content/（内容改动必须两侧同步，勿在本包单独编辑）。
import gettingStarted from './getting-started'
import features from './features'
import shortcuts from './shortcuts'
import faq from './faq'
import changelog from './changelog'

export type HelpSection = {
  id: string
  title: string
  content: string
}

export const helpSections: HelpSection[] = [
  gettingStarted,
  features,
  shortcuts,
  faq,
  changelog,
]

export type { HelpSection as default }
