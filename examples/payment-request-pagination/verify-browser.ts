import { browserCodeRenderer, renderHtmlPages } from '../../packages/print-core/src/browser/index'

const state = { status: 'running', result: null as unknown, error: '' }
;(window as any).verification = state

try {
  const [template, data] = await Promise.all([
    fetch('./payment-request.template.json').then(response => response.json()),
    fetch('./payment-request.data.json').then(response => response.json()),
  ])
  const fixedResult = await renderHtmlPages(template, data, '', browserCodeRenderer)
  const unfixedTemplate = structuredClone(template)
  const attachment = unfixedTemplate.elements.find((element: any) => element.id === 'attachments')
  attachment.options.fixed = false
  const unfixedResult = await renderHtmlPages(unfixedTemplate, data, '', browserCodeRenderer)
  state.result = { ...fixedResult, unfixed: unfixedResult }
  state.status = 'done'
} catch (error) {
  state.error = error instanceof Error ? error.stack ?? error.message : String(error)
  state.status = 'error'
}
