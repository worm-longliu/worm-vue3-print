// 「内容」分组：移植 print-canvas 的 PropertyPanel.bindingDescriptors + BindingControl.vue
// + ImageContentUpload.vue。
// 每项由 core 的绑定注册表声明（getElementBindings / getTableCellBindings），
// 输入框双击打开表达式编辑器，写回统一走 parsePath → 路径末段赋值（与 canvas 同实现）。
import { getElementBindings, getTableCellBindings } from '@worm-vue3-print/core/designer'
import type { BindingDescriptor, RuntimeElement } from '@worm-vue3-print/core/designer'
import { h, render } from '../core/h'
import { field } from './controls'
import type { ShellCtx } from './controls'
import { group } from './prop-group'
import type { DesignerStore } from '../core/store'

/**
 * 统一解析带点分段与数组下标的 targetPath 为段/索引混排数组（与 canvas 的 parsePath 同实现）
 * 例：'options.formatter' → ['options','formatter']
 * 例：'options.tableRows[0].cells[1].formatter' → ['options','tableRows',0,'cells',1,'formatter']
 */
export function parseBindingPath(targetPath: string): (string | number)[] {
  return targetPath.split('.').flatMap(segment => {
    const match = segment.match(/^([^\[]+)((?:\[\d+\])*)$/)
    if (!match) return [segment]
    const baseName = match[1]!
    const indices = [...match[2]!.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]!))
    return [baseName, ...indices]
  })
}

export function readBindingValue(element: RuntimeElement, targetPath: string): string {
  const segments = parseBindingPath(targetPath)
  const result = segments.reduce<any>(
    (current, seg) => (current === null || current === undefined ? '' : current[seg]),
    element,
  )
  return result ?? ''
}

/** 写回：canvas 的 setBindingValue 是「先赋值、后 recordHistory」，此处保持同序 */
export function writeBindingValue(
  store: DesignerStore, element: RuntimeElement, targetPath: string, value: string,
): void {
  const segments = parseBindingPath(targetPath)
  const lastKey = segments.pop()!
  const obj = segments.reduce<any>(
    (current, seg) => {
      if (current[seg] === undefined || current[seg] === null) current[seg] = {}
      return current[seg]
    },
    element,
  )
  obj[lastKey] = value || undefined
  store.recordHistory()
  store.emit()
}

/** 当前应渲染的绑定项：表格有选区时只出选中单元格，否则按注册表（与 canvas 同口径） */
export function bindingDescriptorsFor(ctx: ShellCtx, el: RuntimeElement): BindingDescriptor[] {
  const s = ctx.store
  if (el.printElementType.type === 'table' && s.tableSelection?.elementId === el.id) {
    const { r1, c1 } = s.tableSelection
    const row = (el.options.tableRows ?? [])[r1]
    if (row) return getTableCellBindings(row.type, r1, c1, el.options.fields?.[0]?.dataSource)
  }
  return getElementBindings(el)
}

/** 图片上传（对照 ImageContentUpload.vue）：写回路径固定为 options.src */
function imageUpload(ctx: ShellCtx, el: RuntimeElement): HTMLElement {
  // 需要节点引用来切「上传中...」文案，故直接建真实 DOM 再交给 render 挂载
  const label = document.createElement('label')
  label.className = 'pd-button small upload-label'
  render(h('svg', { class: 'pd-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
    h('path', { fill: 'currentColor', d: 'M12 3l4 4h-3v7h-2V7H8zm-7 12h14v5H5Z' }),
  ]), label)
  const textNode = document.createTextNode('上传图片')
  const input = document.createElement('input')
  input.className = 'visually-hidden'
  input.type = 'file'
  input.accept = 'image/*'
  label.append(textNode, input)

  const setDisabled = (disabled: boolean) => {
    label.className = `pd-button small upload-label${disabled ? ' disabled' : ''}`
    input.disabled = disabled
  }

  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('仅支持上传图片文件')
      input.value = ''
      return
    }
    const upload = ctx.host.uploadImage
    if (!upload) {
      alert('图片上传能力未配置')
      input.value = ''
      return
    }
    setDisabled(true)
    textNode.textContent = '上传中...'
    try {
      const url = await upload(file)
      if (url) writeBindingValue(ctx.store, el, 'options.src', url)
      else alert('图片上传失败')
    } catch (err) {
      alert(err instanceof Error ? err.message : '图片上传失败')
    } finally {
      textNode.textContent = '上传图片'
      setDisabled(!ctx.host.uploadImage)
      input.value = ''
    }
  })
  if (!ctx.host.uploadImage) setDisabled(true)

  const wrap = document.createElement('div')
  wrap.className = 'image-content-upload'
  const tip = document.createElement('p')
  tip.className = 'upload-tip'
  tip.textContent = '支持 jpg/png/gif/bmp/webp/svg 等图片，上传后填入相对路径'
  wrap.append(label, tip)
  return wrap
}

export function bindingGroup(ctx: ShellCtx, el: RuntimeElement) {
  const openEditor = (d: BindingDescriptor) => ctx.fire('open-expression', {
    elementId: el.id,
    targetPath: d.targetPath,
    value: readBindingValue(el, d.targetPath),
  })

  // canvas 的「内容」分组把 BindingControl 列表直接放进 .group-content（没有 form.pd-form 壳）
  return group(ctx, 'binding', '内容', 'Document', [
    ...bindingDescriptorsFor(ctx, el).map(d => field(
      d.label,
      h('input', {
        class: 'pd-input',
        type: 'text',
        value: readBindingValue(el, d.targetPath),
        placeholder: d.placeholder || '输入内容，支持 {字段} 表达式',
        // canvas 用 @input 实时写回；本包整体重绘会打断输入，改为 change（提交时机不同，结果一致）
        onChange: (ev: Event) => writeBindingValue(ctx.store, el, d.targetPath, (ev.target as HTMLInputElement).value),
        onDblclick: () => openEditor(d),
      }),
    )),
    el.printElementType.type === 'image' ? imageUpload(ctx, el) : '',
  ].filter(Boolean))
}
