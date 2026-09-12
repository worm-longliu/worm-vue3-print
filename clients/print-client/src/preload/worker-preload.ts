// worker 专用 preload：sandbox=true 下仅暴露渲染请求/响应桥，不泄露其它 ipcRenderer 能力。
import { contextBridge, ipcRenderer } from 'electron'
import { RENDER_REQUEST_CHANNEL, RENDER_RESPONSE_CHANNEL } from '../shared/render-protocol.js'
import type { RenderJobSpec, RenderResponse } from '../shared/render-protocol.js'

contextBridge.exposeInMainWorld('wormRender', {
  /** 注册主进程渲染请求回调，回调返回响应（异步） */
  onRequest(cb: (id: string, spec: RenderJobSpec) => Promise<RenderResponse>): void {
    ipcRenderer.on(RENDER_REQUEST_CHANNEL, (_event, id: string, spec: RenderJobSpec) => {
      void cb(id, spec).then(response => {
        ipcRenderer.send(RENDER_RESPONSE_CHANNEL, id, response)
      })
    })
  },
})
