import { browserCodeRenderer, renderHtmlPages } from '../../packages/print-core/src/browser/index'

const state = { status: 'running', result: null as unknown, error: '' }
;(window as any).verification = state

try {
  const [template, data] = await Promise.all([
    fetch('./payment-request.template.json').then(response => response.json()),
    fetch('./payment-request.data.json').then(response => response.json()),
  ])
  state.result = await renderHtmlPages(template, data, '', browserCodeRenderer)
  state.status = 'done'
} catch (error) {
  state.error = error instanceof Error ? error.stack ?? error.message : String(error)
  state.status = 'error'
}
