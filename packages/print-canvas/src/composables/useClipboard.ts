// web/src/components/print/composables/useClipboard.ts
import { ref } from 'vue'
import type { RuntimeElement, PrintElementData } from '@worm-vue3-print/core/designer'
import { generateId, generateGroupId } from '@worm-vue3-print/core/designer'

export function useClipboard() {
  const clipboard = ref<PrintElementData[] | null>(null)

  function copy(elements: RuntimeElement[]) {
    clipboard.value = elements.map(e => ({
      options: { ...e.options },
      printElementType: { ...e.printElementType },
    }))
  }

  function paste(offset = 10): RuntimeElement[] | null {
    if (!clipboard.value) return null
    // 组 ID 重映射：粘贴副本绝不能与原组共用 groupId，否则拖一个全跟着动、无法拆分。
    // 仅当同一组在本次粘贴中出现 ≥2 个成员时才保留成组（分配新 ID）；
    // 只复制了组内单个成员的，剥离 groupId，避免残留无意义的组身份。
    const groupCounts = new Map<string, number>()
    for (const item of clipboard.value) {
      const gid = item.options.groupId
      if (gid) groupCounts.set(gid, (groupCounts.get(gid) ?? 0) + 1)
    }
    const groupIdMap = new Map<string, string | undefined>()
    for (const [gid, count] of groupCounts) {
      groupIdMap.set(gid, count >= 2 ? generateGroupId() : undefined)
    }
    return clipboard.value.map(item => ({
      id: generateId(),
      options: {
        ...item.options,
        left: item.options.left + offset,
        top: item.options.top + offset,
        groupId: item.options.groupId
          ? groupIdMap.get(item.options.groupId)
          : undefined,
      },
      printElementType: { ...item.printElementType },
    }))
  }

  function hasData() { return clipboard.value !== null && clipboard.value.length > 0 }

  return { clipboard, copy, paste, hasData }
}
