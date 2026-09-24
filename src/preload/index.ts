import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

type AppEvent = { event: string; data: unknown }

const api = {
  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const reply = await ipcRenderer.invoke('call', method, params)
    if ('error' in reply) throw new Error(reply.error)
    return reply.result as T
  },
  onEvent(listener: (event: AppEvent) => void): () => void {
    const handler = (_: IpcRendererEvent, event: AppEvent) => listener(event)
    ipcRenderer.on('event', handler)
    return () => ipcRenderer.removeListener('event', handler)
  },
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick'),
  open: (path: string): Promise<string> => ipcRenderer.invoke('shell:open', path),
  window: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window', action),
  onWindow(listener: (state: 'closing' | 'maximize' | 'unmaximize' | 'restore') => void): () => void {
    const handler = (_: IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state)
    ipcRenderer.on('window:state', handler)
    return () => ipcRenderer.removeListener('window:state', handler)
  }
}

contextBridge.exposeInMainWorld('nostalgia', api)

export type NostalgiaApi = typeof api
