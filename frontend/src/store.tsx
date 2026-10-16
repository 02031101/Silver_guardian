import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuditEvent, DemoData, LocalState, ReviewStatus, Task } from './types'

export const STORAGE_KEY = 'silver-guardian.demo.v1'
export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending: '待复核',
  confirmed: '确认关注',
  needs_info: '需补充信息',
  dismissed: '暂不采纳',
}
export const RISK_LABELS = { priority: '优先关注', attention: '持续关注', routine: '常规管理' }
export const TASK_LABELS = { pending: '待处理', in_progress: '进行中', completed: '已完成' }
export function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function seedState(data: DemoData): LocalState {
  return {
    version: 1,
    tasks: structuredClone(data.tasks),
    events: [],
    reviews: Object.fromEntries(
      data.patients.map((p) => [
        p.id,
        {
          status: p.reviewStatus,
          note:
            p.reviewStatus === 'needs_info'
              ? '请补充近期血氧记录及居家照护情况。（初始演示记录）'
              : p.reviewStatus === 'pending'
                ? ''
                : '初始演示复核记录。',
          at: p.assessedAt,
          author: '陈医生',
        },
      ]),
    ),
  }
}
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown) => typeof v === 'string'
export function validateState(value: unknown, data: DemoData): value is LocalState {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !isObject(value.reviews) ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.events)
  )
    return false
  const ids = new Set(data.patients.map((p) => p.id))
  if (Object.keys(value.reviews).length !== ids.size) return false
  const reviewsValid = Object.entries(value.reviews).every(
    ([id, r]) =>
      ids.has(id) &&
      isObject(r) &&
      typeof r.status === 'string' &&
      Object.hasOwn(REVIEW_LABELS, r.status) &&
      ['note', 'at', 'author'].every((k) => isString(r[k])),
  )
  const taskIds = new Set<string>()
  const tasksValid = value.tasks.every((t) => {
    if (
      !isObject(t) ||
      !['id', 'patientId', 'title', 'dueDate', 'owner', 'source', 'createdAt'].every((k) =>
        isString(t[k]),
      )
    )
      return false
    if (
      !ids.has(t.patientId as string) ||
      taskIds.has(t.id as string) ||
      !Object.hasOwn(TASK_LABELS, String(t.status)) ||
      !Array.isArray(t.records)
    )
      return false
    taskIds.add(t.id as string)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate as string)) return false
    return t.records.every(
      (r) =>
        isObject(r) &&
        ['id', 'at', 'author', 'contact', 'note', 'action'].every((k) => isString(r[k])),
    )
  })
  return (
    reviewsValid &&
    tasksValid &&
    value.events.every(
      (e) =>
        isObject(e) &&
        ids.has(String(e.patientId)) &&
        ['id', 'at', 'title', 'detail'].every((k) => isString(e[k])),
    )
  )
}
export function validateDataset(value: unknown): value is DemoData {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !isString(value.demoDate) ||
    !Array.isArray(value.patients) ||
    value.patients.length === 0 ||
    !Array.isArray(value.tasks)
  )
    return false
  const valid = value.patients.every(
    (p) =>
      isObject(p) &&
      ['id', 'name', 'sex', 'dischargeDate', 'department', 'owner', 'assessedAt'].every((k) =>
        isString(p[k]),
      ) &&
      typeof p.age === 'number' &&
      typeof p.score === 'number' &&
      p.score >= 0 &&
      p.score <= 1 &&
      typeof p.completeness === 'number' &&
      Object.hasOwn(RISK_LABELS, String(p.risk)) &&
      Object.hasOwn(REVIEW_LABELS, String(p.reviewStatus)) &&
      Array.isArray(p.diseases) &&
      p.diseases.every(isString) &&
      Array.isArray(p.missing) &&
      p.missing.every(isString) &&
      Array.isArray(p.factors) &&
      p.factors.every(
        (f) =>
          isObject(f) &&
          isString(f.name) &&
          isString(f.detail) &&
          typeof f.contribution === 'number' &&
          ['up', 'down'].includes(String(f.direction)),
      ) &&
      Array.isArray(p.labDates) &&
      p.labDates.every(isString) &&
      isObject(p.labs) &&
      ['hemoglobin', 'albumin', 'creatinine', 'leukocyte'].every((k) => {
        const lab = (p.labs as Record<string, unknown>)[k]
        return (
          isObject(lab) &&
          isString(lab.label) &&
          isString(lab.unit) &&
          Array.isArray(lab.reference) &&
          lab.reference.length === 2 &&
          lab.reference.every((v) => typeof v === 'number') &&
          Array.isArray(lab.values) &&
          lab.values.length === (p.labDates as unknown[]).length &&
          lab.values.every((v) => typeof v === 'number' && Number.isFinite(v))
        )
      }) &&
      Array.isArray(p.timeline) &&
      p.timeline.every(
        (e) => isObject(e) && ['date', 'title', 'description', 'type'].every((k) => isString(e[k])),
      ),
  )
  if (!valid || new Set(value.patients.map((p) => p.id)).size !== value.patients.length)
    return false
  return validateState(seedState(value as unknown as DemoData), value as unknown as DemoData)
}

interface Store {
  data: DemoData
  local: LocalState
  toast: { message: string; error: boolean } | null
  notify: (message: string, error?: boolean) => void
  commit: (update: (s: LocalState) => LocalState, message: string) => boolean
  timestamp: () => string
  exportData: () => void
  reset: () => boolean
}
const Context = createContext<Store | null>(null)
export function StoreProvider({
  data,
  initial,
  children,
}: {
  data: DemoData
  initial: LocalState
  children: ReactNode
}) {
  const [local, setLocal] = useState(initial)
  const stateRef = useRef(initial)
  const [toast, setToast] = useState<Store['toast']>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const notify = (message: string, error = false) => {
    clearTimeout(timer.current)
    setToast({ message, error })
    timer.current = setTimeout(() => setToast(null), 4500)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      try {
        const next: unknown = event.newValue === null ? seedState(data) : JSON.parse(event.newValue)
        if (!validateState(next, data)) throw new Error()
        stateRef.current = next
        setLocal(next)
        notify('已同步另一标签页的演示记录')
      } catch {
        notify('另一标签页的数据格式异常，请导出当前记录后重置演示', true)
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [data])
  const commit: Store['commit'] = (update, message) => {
    try {
      const next = update(structuredClone(stateRef.current))
      if (!validateState(next, data)) throw new Error('记录格式校验未通过')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      stateRef.current = next
      setLocal(next)
      notify(message)
      return true
    } catch {
      notify('保存失败，记录未更新。请检查浏览器存储权限或剩余空间。', true)
      return false
    }
  }
  const timestamp = () =>
    `${data.demoDate} ${new Date().toLocaleTimeString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })}`
  const exportData = () => {
    downloadJson(
      {
        exportedAt: new Date().toISOString(),
        dataMode: 'synthetic-demo',
        demoDate: data.demoDate,
        source: '银龄守护前端演示',
        ...stateRef.current,
      },
      `银龄守护-演示记录-${data.demoDate}.json`,
    )
    notify('演示记录已导出')
  }
  const reset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      const next = seedState(data)
      stateRef.current = next
      setLocal(next)
      notify('已恢复初始演示数据')
      return true
    } catch {
      notify('重置失败，请检查浏览器存储权限', true)
      return false
    }
  }
  return (
    <Context.Provider value={{ data, local, toast, notify, commit, timestamp, exportData, reset }}>
      {children}
    </Context.Provider>
  )
}
export function useStore() {
  const store = useContext(Context)
  if (!store) throw new Error('StoreProvider missing')
  return store
}
export function appendEvent(state: LocalState, event: Omit<AuditEvent, 'id'>): LocalState {
  state.events.unshift({ ...event, id: crypto.randomUUID() })
  return state
}
export function isOverdue(task: Task, today: string) {
  return task.status !== 'completed' && task.dueDate < today
}
