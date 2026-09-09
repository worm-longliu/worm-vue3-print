import gettingStarted from './getting-started'
import features from './features'
import shortcuts from './shortcuts'
import faq from './faq'

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
]

export type { HelpSection as default }
