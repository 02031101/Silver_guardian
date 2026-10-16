import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AlertCircle, Download, LoaderCircle, ShieldPlus } from 'lucide-react'
import { App } from './App'
import {
  downloadJson,
  seedState,
  STORAGE_KEY,
  StoreProvider,
  validateDataset,
  validateState,
} from './store'
import type { DemoData, LocalState } from './types'
import './styles.css'

function Bootstrap() {
  const [ready, setReady] = useState<{ data: DemoData; local: LocalState } | null>(null)
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    setStorageError(false)
    fetch(`${import.meta.env.BASE_URL}demo/dataset.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('演示数据加载失败，请检查文件是否完整。')
        const data: unknown = await response.json()
        if (!validateDataset(data)) throw new Error('演示数据格式不正确，请检查 dataset.json。')
        let local: LocalState
        try {
          const saved = localStorage.getItem(STORAGE_KEY)
          const parsed: unknown = saved ? JSON.parse(saved) : seedState(data)
          if (!validateState(parsed, data)) throw new Error()
          local = parsed
        } catch {
          setStorageError(true)
          throw new Error(
            '浏览器中的演示记录无法读取。原记录未被覆盖，你可以先导出，再恢复初始演示。',
          )
        }
        setReady({ data, local })
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : '加载失败，请重试。')
      })
    return () => controller.abort()
  }, [attempt])
  if (!ready)
    return (
      <div className="boot-screen">
        <div className="brand-mark">
          <ShieldPlus size={28} />
        </div>
        <h1>银龄守护</h1>
        <p>让每一次关注，都有后续。</p>
        {error ? (
          <div className="boot-error">
            <AlertCircle />
            <h2>暂时无法打开工作台</h2>
            <p>{error}</p>
            <div className="button-row">
              {storageError && (
                <button
                  className="btn"
                  onClick={() => {
                    try {
                      downloadJson(
                        { raw: localStorage.getItem(STORAGE_KEY) },
                        '银龄守护-原始演示记录.json',
                      )
                    } catch {
                      setError('无法访问浏览器存储，请检查权限后重试。')
                    }
                  }}
                >
                  <Download size={16} />
                  导出原记录
                </button>
              )}
              <button
                className="btn primary"
                onClick={() => {
                  try {
                    if (storageError) localStorage.removeItem(STORAGE_KEY)
                    setAttempt((v) => v + 1)
                  } catch {
                    setError('无法重置浏览器存储，请检查权限。')
                  }
                }}
              >
                {storageError ? '恢复初始演示' : '重新加载'}
              </button>
            </div>
          </div>
        ) : (
          <LoaderCircle className="spin" aria-label="正在加载演示数据" />
        )}
      </div>
    )
  return (
    <StoreProvider data={ready.data} initial={ready.local}>
      <HashRouter>
        <App />
      </HashRouter>
    </StoreProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
)
