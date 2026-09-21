// happy-dom 在 vitest 高并发（多 worker 抢启动）时偶发 localStorage 未就绪，
// 导致挂载组件（HelpModal / PropertyGroup 等）时裸 localStorage 为 undefined。
// 在全局 setup 统一兜底，替代散落在各 spec 里的单文件 mock。
if (typeof (globalThis as { localStorage?: Storage }).localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)) },
      removeItem: (key: string) => { store.delete(key) },
      clear: () => { store.clear() },
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() { return store.size },
    },
    configurable: true,
    writable: true,
  })
}
