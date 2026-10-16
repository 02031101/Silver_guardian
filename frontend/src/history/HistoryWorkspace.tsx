import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCheck,
  CircleHelp,
  ClipboardList,
  Download,
  FileCheck2,
  FileText,
  Info,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Plus,
  ShieldCheck,
  ShieldPlus,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { Empty, Modal, PageHeading, PanelTitle, SearchInput } from '../components'
import { downloadJson } from '../files'
import { conflictDateCount, importHistoricalFiles, latestScores } from './data'
import type { HistoricalDataset, HistoricalPatient } from './data'
import './history.css'

const formatNumber = (value: number) => value.toLocaleString('zh-CN')
const display = (value: number | null, digits = 2) =>
  value === null ? '未提供' : Number(value.toFixed(digits)).toLocaleString('zh-CN')
const localTime = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
type Tab = 'overview' | 'patients' | 'reviews' | 'tasks'
interface Note {
  status: string
  text: string
  at: string
}
interface LocalTask {
  id: string
  patientId: string
  title: string
  dueDate: string
  status: 'pending' | 'in_progress' | 'completed'
  records: { at: string; contact: string; text: string }[]
}
interface Workflow {
  version: 1
  notes: Record<string, Note>
  tasks: LocalTask[]
}
const blankWorkflow = (): Workflow => ({ version: 1, notes: {}, tasks: [] })
const noteLabels: Record<string, string> = {
  confirmed: '已核对',
  needs_info: '需补充来源',
  dismissed: '暂不采纳',
}

export function HistoryImportModal({
  onClose,
  onImported,
  embedded = false,
}: {
  onClose: () => void
  onImported: (data: HistoricalDataset) => void
  embedded?: boolean
}) {
  const [wide, setWide] = useState<File | null>(null)
  const [risk, setRisk] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!wide || !risk) {
      setError('请选择患者宽表和再入院评分表。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await importHistoricalFiles(wide, risk)
      if (active.current) onImported(data)
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : '导入失败，请核对文件。')
    } finally {
      if (active.current) setBusy(false)
    }
  }
  const body = (
    <form className="modal-body import-form" onSubmit={submit}>
      <label className={`file-picker ${wide ? 'has-file' : ''}`}>
        <span className="file-step">01</span>
        <span className="file-picker-text">
          <strong>患者健康画像宽表</strong>
          <span>{wide ? wide.name : '选择宽表 CSV 文件'}</span>
        </span>
        <Upload size={21} />
        <input
          type="file"
          aria-label="患者健康画像宽表"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            setWide(e.target.files?.[0] ?? null)
            setError('')
          }}
          required
        />
      </label>
      <label className={`file-picker ${risk ? 'has-file' : ''}`}>
        <span className="file-step">02</span>
        <span className="file-picker-text">
          <strong>再入院风险评分表</strong>
          <span>{risk ? risk.name : '选择评分 CSV 文件'}</span>
        </span>
        <Upload size={21} />
        <input
          type="file"
          aria-label="再入院风险评分表"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            setRisk(e.target.files?.[0] ?? null)
            setError('')
          }}
          required
        />
      </label>
      <p className="import-format-note">支持 UTF-8 / GB18030，单个文件不超过 32 MiB。</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-footer">
        {!embedded && (
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            取消
          </button>
        )}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? <LoaderCircle size={18} className="spin" /> : <ArrowRight size={18} />}
          {busy ? '正在读取与关联…' : '打开工作台'}
        </button>
      </div>
      <p className="import-storage-note">刷新后需重新选择文件；已保存的核对和随访记录仍会保留。</p>
    </form>
  )
  return embedded ? (
    body
  ) : (
    <Modal
      title="更换数据文件"
      subtitle="导入新文件后，页面切换到对应的患者档案。"
      onClose={() => {
        if (!busy) onClose()
      }}
      wide
    >
      {body}
    </Modal>
  )
}

function ScoreLabel({ patient }: { patient: HistoricalPatient }) {
  const latest = latestScores(patient)
  if (!latest.entries.length) return <span className="neutral-pill">未关联评分</span>
  if (latest.conflicting) return <span className="history-conflict-pill">同日记录待核对</span>
  return (
    <span
      className={`badge risk-${latest.level === '高风险' ? 'priority' : latest.level === '中风险' ? 'attention' : 'routine'}`}
    >
      {latest.level}
    </span>
  )
}

function isWorkflow(value: unknown, data: HistoricalDataset): value is Workflow {
  if (!value || typeof value !== 'object') return false
  const v = value as Workflow
  const ids = new Set(data.patients.map((p) => p.id))
  if (
    v.version !== 1 ||
    !v.notes ||
    typeof v.notes !== 'object' ||
    Array.isArray(v.notes) ||
    !Array.isArray(v.tasks)
  )
    return false
  if (
    !Object.entries(v.notes).every(
      ([id, n]) =>
        ids.has(id) &&
        n &&
        Object.hasOwn(noteLabels, n.status) &&
        typeof n.text === 'string' &&
        typeof n.at === 'string',
    )
  )
    return false
  const seen = new Set<string>()
  return v.tasks.every((t) => {
    if (
      !t ||
      typeof t.id !== 'string' ||
      seen.has(t.id) ||
      !ids.has(t.patientId) ||
      typeof t.title !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ||
      !['pending', 'in_progress', 'completed'].includes(t.status) ||
      !Array.isArray(t.records)
    )
      return false
    seen.add(t.id)
    return t.records.every(
      (r) =>
        r && ['at', 'contact', 'text'].every((k) => typeof r[k as keyof typeof r] === 'string'),
    )
  })
}

export function HistoryWorkspace({
  data,
  onReplace,
}: {
  data: HistoricalDataset
  onReplace: () => void
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [info, setInfo] = useState(false)
  const [reviewPatient, setReviewPatient] = useState<HistoricalPatient | null>(null)
  const [taskPatient, setTaskPatient] = useState<string | null>(null)
  const [recordTask, setRecordTask] = useState<LocalTask | null>(null)
  const [resetDialog, setResetDialog] = useState(false)
  const [message, setMessage] = useState('')
  const [storageError, setStorageError] = useState(false)
  const key = `silver-guardian.history.v1.${data.fingerprint}`
  const [workflow, setWorkflow] = useState<Workflow>(blankWorkflow)
  const stateRef = useRef(workflow)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      const next: unknown = raw ? JSON.parse(raw) : blankWorkflow()
      if (!isWorkflow(next, data)) throw new Error()
      stateRef.current = next
      setWorkflow(next)
    } catch {
      setStorageError(true)
      setMessage('本地流程记录无法读取，原记录未覆盖。请先导出原记录，再恢复本地流程。')
    }
  }, [key, data])
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key !== key) return
      try {
        const next: unknown = e.newValue ? JSON.parse(e.newValue) : blankWorkflow()
        if (!isWorkflow(next, data)) throw new Error()
        stateRef.current = next
        setWorkflow(next)
        setStorageError(false)
        setMessage('已同步其他标签页的本地流程记录。')
      } catch {
        setStorageError(true)
        setMessage('其他标签页的记录格式异常，已暂停保存；请导出原记录后恢复。')
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [key, data])
  const commit = (action: (s: Workflow) => void) => {
    if (storageError) return false
    try {
      const next = structuredClone(stateRef.current)
      action(next)
      if (!isWorkflow(next, data)) throw new Error()
      localStorage.setItem(key, JSON.stringify(next))
      stateRef.current = next
      setWorkflow(next)
      setMessage('记录已保存。')
      return true
    } catch {
      setMessage('保存失败，记录未更新。请检查浏览器存储权限或剩余空间。')
      return false
    }
  }
  const navigate = (next: Tab) => {
    setTab(next)
    setSelected(null)
    setQuery('')
    setMobileMenu(false)
    window.scrollTo({ top: 0 })
  }
  useEffect(() => {
    document.title = `真实历史数据 · 银龄守护`
  }, [])
  const showPatient = (patient: HistoricalPatient) => {
    setSelected(patient.id)
    setTab('patients')
    window.scrollTo({ top: 0 })
  }
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenu(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])
  useEffect(() => {
    if (!message || storageError || message.startsWith('保存失败')) return
    const timer = setTimeout(() => setMessage(''), 3500)
    return () => clearTimeout(timer)
  }, [message, storageError])
  const current = data.patients.find((p) => p.id === selected)
  const exportWorkflow = () =>
    downloadJson(
      {
        dataMode: 'historical-local-workflow',
        datasetFingerprint: data.fingerprint,
        exportedAt: new Date().toISOString(),
        description:
          '仅包含当前核对与随访记录，不代表原始医疗随访事实。患者需使用相同文件重新导入后关联。',
        ...stateRef.current,
      },
      '银龄守护-本地流程记录.json',
    )
  const nav = [
    { id: 'overview', label: '工作台', icon: LayoutDashboard },
    { id: 'patients', label: '患者档案', icon: Users },
    { id: 'reviews', label: '评分核对', icon: ShieldCheck },
    { id: 'tasks', label: '随访任务', icon: ClipboardList },
  ] as const
  const noRecords = data.patients.filter((p) => !p.scores.length).length
  return (
    <div className="app-shell history-shell">
      {mobileMenu && (
        <button
          className="mobile-scrim"
          aria-label="关闭导航"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <button className="brand" onClick={() => navigate('overview')}>
          <span className="brand-mark">
            <ShieldPlus size={27} />
          </span>
          <div>
            <strong>银龄守护</strong>
            <span>健康档案与连续随访</span>
          </div>
        </button>
        <div className="workspace-label">智慧医疗 · 连续健康管理</div>
        <div className="nav-group-label">患者管理</div>
        <nav aria-label="历史数据导航">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${tab === n.id ? 'active' : ''}`}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-help" onClick={() => setInfo(true)}>
            <CircleHelp size={18} />
            <span>数据说明</span>
            <ArrowRight size={14} />
          </button>
          <div className="local-environment">
            <span className="small-green-dot" />
            历史数据 · 本地读取
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-menu-button"
              aria-label="打开导航"
              onClick={() => setMobileMenu((v) => !v)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-current">{nav.find((n) => n.id === tab)?.label}</span>
          </div>
          <div className="button-row history-header-actions">
            <button className="btn small" onClick={onReplace}>
              <Upload size={15} />
              更换数据
            </button>
            <button className="btn small" onClick={exportWorkflow}>
              <Download size={15} />
              导出记录
            </button>
          </div>
        </header>
        <main className="main-content">
          <div className="content-wrap">
            {message && (
              <div
                className={`history-message ${storageError ? 'error' : ''}`}
                role={storageError || message.startsWith('保存失败') ? 'alert' : 'status'}
              >
                <Info size={15} />
                <span>{message}</span>
                {storageError && (
                  <button
                    className="text-link"
                    onClick={() => {
                      try {
                        downloadJson(
                          { raw: localStorage.getItem(key) },
                          '银龄守护-本地流程原记录.json',
                        )
                      } catch {
                        setMessage('无法读取浏览器存储，请检查权限。')
                      }
                    }}
                  >
                    导出原记录
                  </button>
                )}
                <button className="icon-btn" aria-label="关闭提示" onClick={() => setMessage('')}>
                  <X size={15} />
                </button>
              </div>
            )}
            {tab === 'overview' && (
              <>
                <PageHeading
                  eyebrow="HISTORICAL DATA / 工作台"
                  title="健康管理概览"
                  description="查看患者档案、历史评分与待核对记录。"
                  actions={
                    <div className="date-chip">
                      <FileText size={17} />
                      <div>
                        <strong>{data.sources[0].columns} 个宽表字段</strong>
                        <span>历史分析结果</span>
                      </div>
                    </div>
                  }
                />
                <div className="metrics-grid">
                  {[
                    {
                      label: '患者档案',
                      value: data.patients.length,
                      detail: '按患者编号去重',
                      icon: Users,
                    },
                    {
                      label: '成功关联评分',
                      value: data.summary.matchedPatients,
                      detail: `未关联 ${noRecords} 位患者`,
                      icon: CheckCheck,
                    },
                    {
                      label: '关联评分记录',
                      value: data.summary.matchedRows,
                      detail: '按原表行数统计，含重复行',
                      icon: FileText,
                    },
                    {
                      label: '待核对记录组',
                      value: data.summary.conflictingDates,
                      detail: '存在不同评分或标签',
                      icon: ShieldCheck,
                    },
                  ].map((m) => (
                    <div className="metric-card" key={m.label}>
                      <div className="metric-top">
                        <span>{m.label}</span>
                        <span className="metric-icon teal">
                          <m.icon size={18} />
                        </span>
                      </div>
                      <div className="metric-value">{formatNumber(m.value)}</div>
                      <div className="metric-bottom">{m.detail}</div>
                    </div>
                  ))}
                </div>
                <div className="history-overview-grid">
                  <section className="panel">
                    <PanelTitle
                      title="患者概览"
                      subtitle="查看近期导入的患者与历史评分"
                      action={
                        <button className="text-link" onClick={() => navigate('patients')}>
                          全部患者
                          <ArrowRight size={14} />
                        </button>
                      }
                    />
                    <HistoryPatientTable
                      patients={data.patients.slice(0, 5)}
                      compact
                      workflow={workflow}
                      onSelect={showPatient}
                    />
                    <div className="panel-footnote">仅统计本次导入范围。</div>
                  </section>
                  <section className="panel history-quality">
                    <PanelTitle title="数据关联情况" subtitle="完整保留原始记录与差异" />
                    <dl>
                      <div>
                        <dt>评分文件记录数</dt>
                        <dd>{formatNumber(data.summary.scoreRows)}</dd>
                      </div>
                      <div>
                        <dt>评分文件患者数</dt>
                        <dd>{formatNumber(data.summary.scorePatients)}</dd>
                      </div>
                      <div>
                        <dt>完全重复的额外行</dt>
                        <dd>{formatNumber(data.summary.exactRepeatRows)}</dd>
                      </div>
                      <div>
                        <dt>关联的不同结果</dt>
                        <dd>{formatNumber(data.summary.matchedDistinctRows)}</dd>
                      </div>
                      <div>
                        <dt>实际标签存在差异</dt>
                        <dd>{formatNumber(data.summary.conflictingOutcomes)}</dd>
                      </div>
                    </dl>
                    <div className="history-quality-note">
                      <Info size={16} />
                      <p>同日不同评分逐条保留。缺少就诊编号时，不自动合并为同一次住院。</p>
                    </div>
                    <button className="btn small" onClick={() => navigate('reviews')}>
                      查看评分核对队列
                      <ArrowRight size={14} />
                    </button>
                  </section>
                </div>
              </>
            )}
            {tab === 'patients' && !current && (
              <>
                <PageHeading
                  eyebrow="PATIENT RECORDS / 真实历史档案"
                  title="患者档案"
                  description="按患者编号、慢病和评分状态查找档案。"
                />
                <HistoryDirectory
                  data={data}
                  workflow={workflow}
                  query={query}
                  onQuery={setQuery}
                  onSelect={showPatient}
                />
              </>
            )}
            {tab === 'patients' && current && (
              <HistoryPatientDetail
                patient={current}
                workflow={workflow}
                onBack={() => setSelected(null)}
                onReview={() => setReviewPatient(current)}
                onTask={() => setTaskPatient(current.id)}
              />
            )}
            {tab === 'reviews' && (
              <>
                <PageHeading
                  eyebrow="SOURCE REVIEW / 评分核对"
                  title="评分核对"
                  description="查看同日差异记录，保存核对意见与待补充事项。"
                />
                <HistoryReviewQueue
                  data={data}
                  workflow={workflow}
                  onSelect={showPatient}
                  onReview={setReviewPatient}
                />
              </>
            )}
            {tab === 'tasks' && (
              <>
                <PageHeading
                  eyebrow="LOCAL WORKFLOW / 随访任务"
                  title="随访任务"
                  description="安排随访，记录联系结果与后续处理。"
                  actions={
                    <button
                      className="btn primary"
                      onClick={() => setTaskPatient(data.patients[0].id)}
                    >
                      <Plus size={16} />
                      新建随访任务
                    </button>
                  }
                />
                <HistoryTasks
                  data={data}
                  workflow={workflow}
                  onRecord={setRecordTask}
                  onPatient={showPatient}
                  onStart={(task) =>
                    commit((s) => {
                      const t = s.tasks.find((t) => t.id === task.id)!
                      t.status = 'in_progress'
                    })
                  }
                />
              </>
            )}
            <footer className="app-footer">银龄守护 · 历史健康档案</footer>
          </div>
        </main>
      </div>
      {reviewPatient && (
        <HistoryReviewModal
          patient={reviewPatient}
          note={workflow.notes[reviewPatient.id]}
          onClose={() => setReviewPatient(null)}
          onSave={(note) =>
            commit((s) => {
              s.notes[reviewPatient.id] = note
            })
          }
        />
      )}
      {taskPatient && (
        <HistoryTaskModal
          data={data}
          patientId={taskPatient}
          onClose={() => setTaskPatient(null)}
          onSave={(task) =>
            commit((s) => {
              s.tasks.unshift(task)
            })
          }
        />
      )}
      {recordTask && (
        <HistoryRecordModal
          task={recordTask}
          onClose={() => setRecordTask(null)}
          onSave={(contact, text, done, dueDate) =>
            commit((s) => {
              const target = s.tasks.find((t) => t.id === recordTask.id)!
              target.records.unshift({ at: new Date().toISOString(), contact, text })
              target.status = done && contact === '已联系' ? 'completed' : 'in_progress'
              if (target.status !== 'completed') target.dueDate = dueDate
            })
          }
        />
      )}
      {resetDialog && (
        <Modal
          title="清空本地流程记录？"
          subtitle="原始 CSV 和内存中的历史分析结果不会改变。"
          onClose={() => setResetDialog(false)}
        >
          <div className="modal-body">
            <p className="body-copy">
              将删除这组文件对应的核对意见与随访任务。可先导出保存，其他文件的记录不受影响。
            </p>
            <button className="text-link" onClick={exportWorkflow}>
              <Download size={15} />
              先导出记录
            </button>
            <div className="modal-footer">
              <button className="btn" onClick={() => setResetDialog(false)}>
                取消
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  try {
                    localStorage.removeItem(key)
                    const next = blankWorkflow()
                    stateRef.current = next
                    setWorkflow(next)
                    setStorageError(false)
                    setMessage('本地流程已清空，历史数据未变。')
                    setResetDialog(false)
                  } catch {
                    setMessage('无法清空本地流程，请检查浏览器存储权限。')
                  }
                }}
              >
                确认清空
              </button>
            </div>
          </div>
        </Modal>
      )}
      {info && (
        <Modal
          title="真实数据说明"
          subtitle="历史数据、模型输出和本地操作分开呈现。"
          onClose={() => setInfo(false)}
          wide
        >
          <div className="modal-body">
            <div className="history-source-cards">
              {data.sources.map((s) => (
                <div key={s.name}>
                  <FileText size={20} />
                  <strong>{s.name}</strong>
                  <p>
                    {formatNumber(s.rows)} 行 · {s.columns} 列 · {s.encoding}
                  </p>
                </div>
              ))}
            </div>
            <div className="history-quality-note">
              <Info size={17} />
              <p>
                评分文件入院日期覆盖 {data.summary.dateMin} 至 {data.summary.dateMax}
                。宽表没有特征窗口时间，不能将此范围视为宽表全部检验记录的时间范围。模型计算时间与版本未提供。
              </p>
            </div>
            <div className="history-info-list">
              <p>文件仅在浏览器内读取，刷新后重新选择相同文件即可关联已保存的核对与随访记录。</p>
              <p>
                原表未提供的姓名、出院日期、检验明细和模型解释保持为空；所有评分按已有模型输出展示。
              </p>
            </div>
            <div className="modal-footer">
              <span className="footer-note">导入于 {localTime(data.importedAt)}</span>
              <button
                className="btn danger-outline"
                onClick={() => {
                  setInfo(false)
                  setResetDialog(true)
                }}
              >
                清除本地记录
              </button>
              <button className="btn primary" onClick={() => setInfo(false)}>
                了解了
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function HistoryPatientTable({
  patients,
  workflow,
  onSelect,
  compact = false,
}: {
  compact?: boolean
  patients: HistoricalPatient[]
  workflow: Workflow
  onSelect: (p: HistoricalPatient) => void
}) {
  if (!patients.length) return <Empty />
  return (
    <div className="table-scroll">
      <table className={`patient-table history-table ${compact ? 'compact' : ''}`}>
        <thead>
          <tr>
            <th>患者</th>
            <th>主要共病</th>
            {!compact && <th>最新入院日期</th>}
            <th>历史评分</th>
            {!compact && <th>核对状态</th>}
            <th>
              <span className="sr-only">详情</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id}>
              <td>
                <button className="patient-cell" onClick={() => onSelect(p)}>
                  <span className="avatar teal">患</span>
                  <span>
                    <strong>患者 {p.id}</strong>
                    <span className="cell-meta">
                      {p.age === null ? '年龄未提供' : `${p.age} 岁`} · {p.sex}
                    </span>
                  </span>
                </button>
              </td>
              <td>
                <div className="disease-tags">
                  {p.diseases.length ? (
                    <>
                      {p.diseases.slice(0, 2).map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                      {p.diseases.length > 2 && <span>+{p.diseases.length - 2}</span>}
                    </>
                  ) : (
                    <span>原表未标记慢病</span>
                  )}
                </div>
              </td>
              {!compact && <td className="date-text">{latestScores(p).date || '未关联'}</td>}
              <td>
                <ScoreLabel patient={p} />
              </td>
              {!compact && (
                <td>
                  <span className="neutral-pill">
                    {noteLabels[workflow.notes[p.id]?.status] ?? '未核对'}
                  </span>
                </td>
              )}
              <td>
                <button
                  className="table-arrow"
                  aria-label={`查看患者 ${p.id}`}
                  onClick={() => onSelect(p)}
                >
                  <ArrowRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
function HistoryDirectory({
  data,
  workflow,
  query,
  onQuery,
  onSelect,
}: {
  data: HistoricalDataset
  workflow: Workflow
  query: string
  onQuery: (q: string) => void
  onSelect: (p: HistoricalPatient) => void
}) {
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const filtered = useMemo(
    () =>
      data.patients.filter(
        (p) =>
          `${p.id} ${p.sourceId} ${p.diseases.join(' ')}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()) &&
          (filter === 'all' ||
            (filter === 'conflict' ? conflictDateCount(p) > 0 : p.scores.length === 0)),
      ),
    [data, query, filter],
  )
  const pages = Math.max(1, Math.ceil(filtered.length / 20))
  const currentPage = Math.min(page, pages)
  return (
    <section className="panel">
      <div className="filter-toolbar">
        <SearchInput
          value={query}
          onChange={(q) => {
            onQuery(q)
            setPage(1)
          }}
          placeholder="搜索显示编号、原始编号或慢病"
          label="搜索历史患者"
        />
        <select
          aria-label="历史评分筛选"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">全部患者</option>
          <option value="conflict">存在同日差异</option>
          <option value="unmatched">未关联评分</option>
        </select>
      </div>
      <HistoryPatientTable
        patients={filtered.slice((currentPage - 1) * 20, currentPage * 20)}
        workflow={workflow}
        onSelect={onSelect}
      />
      <Pagination current={currentPage} pages={pages} count={filtered.length} onPage={setPage} />
    </section>
  )
}
function Pagination({
  current,
  pages,
  count,
  onPage,
}: {
  current: number
  pages: number
  count: number
  onPage: (page: number) => void
}) {
  return (
    <div className="table-footer history-pagination">
      <span>
        共 {formatNumber(count)} 条 · 第 {current} / {pages} 页
      </span>
      <div>
        <button className="btn small" disabled={current <= 1} onClick={() => onPage(current - 1)}>
          上一页
        </button>
        <button
          className="btn small"
          disabled={current >= pages}
          onClick={() => onPage(current + 1)}
        >
          下一页
        </button>
      </div>
    </div>
  )
}

function HistoryPatientDetail({
  patient: p,
  workflow,
  onBack,
  onReview,
  onTask,
}: {
  patient: HistoricalPatient
  workflow: Workflow
  onBack: () => void
  onReview: () => void
  onTask: () => void
}) {
  const [scorePage, setScorePage] = useState(1)
  const note = workflow.notes[p.id]
  const latest = latestScores(p)
  const records = workflow.tasks
    .filter((t) => t.patientId === p.id)
    .flatMap((t) => t.records.map((r) => ({ ...r, title: t.title })))
  const pages = Math.max(1, Math.ceil(p.scores.length / 12))
  const page = Math.min(scorePage, pages)
  return (
    <>
      <button className="detail-breadcrumb" onClick={onBack}>
        <ArrowLeft size={15} />
        返回历史患者目录
      </button>
      <section className="patient-profile">
        <div className="profile-identity">
          <span className="avatar large teal">患</span>
          <div>
            <div className="profile-name">
              <h1>患者 {p.id}</h1>
              <span className="history-real-pill">历史档案</span>
            </div>
            <p>
              {p.age === null ? '年龄未提供' : `${p.age} 岁`}
              <span>·</span>
              {p.sex}
              <span>·</span>姓名、科室与出院日期未提供
            </p>
            <div className="profile-diseases">
              {p.diseases.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <button className="btn" onClick={onReview}>
            <FileCheck2 size={16} />
            记录评分核对
          </button>
          <button className="btn primary" onClick={onTask}>
            <Plus size={16} />
            新建随访任务
          </button>
        </div>
      </section>
      <div className="profile-summary">
        <span>
          就诊次数<strong>{display(p.visits, 0)}</strong>
        </span>
        <span>
          住院次数<strong>{display(p.admissions, 0)}</strong>
        </span>
        <span>
          画像标签<strong>{p.group.replace(/^[?\uFFFD\s]+/, '') || '未提供'}</strong>
        </span>
        <span>
          归属值<strong>{display(p.membership, 4)}</strong>
        </span>
      </div>
      <details className="history-source-id">
        <summary>查看原始关联编号</summary>
        <code>{p.sourceId}</code>
        <p>仅用于本地核对，不是患者姓名。页面显示编号为本次文件导入生成。</p>
      </details>
      <div className="history-detail-grid">
        <section className="panel">
          <PanelTitle title="检验汇总" subtitle="均值、范围与末次记录" />
          <div className="table-scroll">
            <table className="patient-table history-lab-summary">
              <thead>
                <tr>
                  <th>指标</th>
                  <th>末次值</th>
                  <th>均值</th>
                  <th>最小值</th>
                  <th>最大值</th>
                  <th>记录数</th>
                </tr>
              </thead>
              <tbody>
                {p.labs.map((l) => (
                  <tr key={l.label}>
                    <td>{l.label}</td>
                    <td>{display(l.last)}</td>
                    <td>{display(l.mean)}</td>
                    <td>{display(l.min)}</td>
                    <td>{display(l.max)}</td>
                    <td>{display(l.count, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="history-quality-note">
            <Info size={16} />
            <p>原文件未提供检验日期与单位，仅展示汇总值。</p>
          </div>
        </section>
        <section className="panel">
          <PanelTitle title="最近入院评分" action={<ScoreLabel patient={p} />} />
          <div className="history-latest-score">
            <strong>
              {latest.conflicting
                ? '待核对'
                : latest.score === null
                  ? '未提供'
                  : display(latest.score, 4)}
            </strong>
            <p>对应入院日期：{latest.date || '未关联记录'}</p>
            <span>
              {latest.conflicting
                ? `同日有 ${latest.entries.length} 条不同导出记录，未任意取平均或最大值。`
                : '原模型评分，范围 0–1。'}
            </span>
          </div>
          <div className="history-quality-note">
            <Info size={16} />
            <p>模型版本、计算时间和个体解释未提供。</p>
          </div>
        </section>
      </div>
      <section className="panel history-section">
        <PanelTitle title="共病模型评分" subtitle="保留宽表中的原始输出" />
        <div className="history-disease-scores">
          {p.diseaseScores.length ? (
            p.diseaseScores.map((s) => (
              <div key={s.disease}>
                <span>{s.disease}</span>
                <strong>{display(s.score, 4)}</strong>
              </div>
            ))
          ) : (
            <p className="body-copy">原表未提供疾病评分。</p>
          )}
        </div>
      </section>
      <section className="panel history-section">
        <PanelTitle title="再入院评分记录" subtitle="相同结果合并展示，并保留原表出现次数" />
        <div className="table-scroll">
          <table className="patient-table history-score-table">
            <thead>
              <tr>
                <th>入院日期</th>
                <th>原始评分</th>
                <th>原模型等级</th>
                <th>30 天实际标签</th>
                <th>原表出现次数</th>
              </tr>
            </thead>
            <tbody>
              {p.scores.slice((page - 1) * 12, page * 12).map((s) => (
                <tr key={s.id}>
                  <td>{s.admittedAt}</td>
                  <td>{display(s.score, 4)}</td>
                  <td>{s.level}</td>
                  <td>{s.actual === 1 ? '1 · 原表标记再入院' : '0 · 原表未标记再入院'}</td>
                  <td>{s.repetitions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!p.scores.length && (
          <Empty title="没有关联评分" description="该患者不在当前评分文件中，未生成替代评分。" />
        )}
        <Pagination current={page} pages={pages} count={p.scores.length} onPage={setScorePage} />
      </section>
      <div className="detail-bottom">
        <section className="panel">
          <PanelTitle
            title="核对意见"
            subtitle="查看当前保存的核对意见"
            action={<span className="neutral-pill">{noteLabels[note?.status] ?? '未核对'}</span>}
          />
          <p className="review-note">
            {note?.text || '尚无核对意见。可核实评分差异、关联关系及缺失字段。'}
          </p>
          <div className="review-note-footer">
            <span>{note ? localTime(note.at) : '历史数据未被修改'}</span>
            <button className="text-link" onClick={onReview}>
              记录核对
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
        <section className="panel">
          <PanelTitle title="随访记录" subtitle="按本次记录时间排列" />
          {records.length ? (
            <div className="record-list">
              {records.map((r, i) => (
                <div className="record-item" key={r.at + i}>
                  <div>
                    <h3>
                      {r.title} · {r.contact}
                    </h3>
                    <p>{r.text}</p>
                    <small>{localTime(r.at)} · 当前用户</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="暂无随访记录" description="联系后填写随访记录，处理过程将在这里保留。" />
          )}
        </section>
      </div>
    </>
  )
}

function HistoryReviewQueue({
  data,
  workflow,
  onSelect,
  onReview,
}: {
  data: HistoricalDataset
  workflow: Workflow
  onSelect: (p: HistoricalPatient) => void
  onReview: (p: HistoricalPatient) => void
}) {
  const [filter, setFilter] = useState('conflict')
  const [page, setPage] = useState(1)
  const patients = data.patients.filter(
    (p) =>
      filter === 'all' ||
      (filter === 'conflict' ? conflictDateCount(p) > 0 : !workflow.notes[p.id]),
  )
  const pages = Math.max(1, Math.ceil(patients.length / 15))
  const current = Math.min(page, pages)
  return (
    <section className="panel">
      <div className="filter-toolbar">
        <span className="tiny-label">保留同日差异，逐条核对</span>
        <select
          aria-label="评分核对筛选"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="conflict">存在同日差异</option>
          <option value="pending">尚无本地核对</option>
          <option value="all">全部患者</option>
        </select>
      </div>
      <div className="history-review-list">
        {patients.slice((current - 1) * 15, current * 15).map((p) => (
          <article key={p.id}>
            <div>
              <h3>
                患者 {p.id}
                <span className="neutral-pill">
                  {noteLabels[workflow.notes[p.id]?.status] ?? '未核对'}
                </span>
              </h3>
              <p>
                {conflictDateCount(p)
                  ? `${conflictDateCount(p)} 组同患者同日存在不同导出记录，需补充就诊编号。`
                  : '暂无同日差异，仍需核对字段含义和关联关系。'}
              </p>
              {workflow.notes[p.id] && (
                <p className="history-saved-note">{workflow.notes[p.id].text}</p>
              )}
            </div>
            <div>
              <button className="btn small" onClick={() => onSelect(p)}>
                查看原始结果
              </button>
              <button className="btn primary small" onClick={() => onReview(p)}>
                记录核对
              </button>
            </div>
          </article>
        ))}
      </div>
      {!patients.length && (
        <Empty title="当前没有此类记录" description="切换筛选可查看其他患者。" />
      )}
      <Pagination current={current} pages={pages} count={patients.length} onPage={setPage} />
    </section>
  )
}

function HistoryTasks({
  data,
  workflow,
  onRecord,
  onPatient,
  onStart,
}: {
  data: HistoricalDataset
  workflow: Workflow
  onRecord: (task: LocalTask) => void
  onPatient: (p: HistoricalPatient) => void
  onStart: (task: LocalTask) => void
}) {
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const tasks = workflow.tasks.filter((t) => filter === 'all' || t.status === filter)
  const pages = Math.max(1, Math.ceil(tasks.length / 15))
  const current = Math.min(page, pages)
  return (
    <section className="panel">
      <div className="filter-toolbar">
        <span className="tiny-label">当前创建的随访任务</span>
        <select
          aria-label="本地任务状态"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(1)
          }}
        >
          <option value="all">全部状态</option>
          <option value="pending">待处理</option>
          <option value="in_progress">进行中</option>
          <option value="completed">已完成</option>
        </select>
      </div>
      {tasks.length ? (
        <div className="followup-list">
          {tasks.slice((current - 1) * 15, current * 15).map((task) => (
            <article className="followup-card" key={task.id}>
              <div className="followup-card-main">
                <span className="followup-status-icon">
                  <ClipboardList size={20} />
                </span>
                <div className="followup-content">
                  <div className="followup-title">
                    <h3>{task.title}</h3>
                    <span className={`task-status ${task.status}`}>
                      {
                        { pending: '待处理', in_progress: '进行中', completed: '已完成' }[
                          task.status
                        ]
                      }
                    </span>
                  </div>
                  <button
                    className="text-link history-task-person"
                    onClick={() => onPatient(data.patients.find((p) => p.id === task.patientId)!)}
                  >
                    患者 {task.patientId}
                    <ArrowRight size={13} />
                  </button>
                  <div className="task-meta">
                    <span>
                      <CalendarDays size={14} />
                      计划 {task.dueDate}
                    </span>
                    <span>当前用户</span>
                    <span>{task.records.length} 条记录</span>
                  </div>
                </div>
                <div className="task-actions">
                  {task.status === 'pending' && (
                    <button className="btn small" onClick={() => onStart(task)}>
                      开始处理
                    </button>
                  )}
                  {task.status !== 'completed' && (
                    <button className="btn primary small" onClick={() => onRecord(task)}>
                      填写随访记录
                    </button>
                  )}
                </div>
              </div>
              {task.records.length > 0 && (
                <details className="task-records">
                  <summary>查看本地联系记录</summary>
                  {task.records.map((r, i) => (
                    <div className="task-record" key={r.at + i}>
                      <strong>
                        {r.contact} · {localTime(r.at)}
                      </strong>
                      <p>{r.text}</p>
                    </div>
                  ))}
                </details>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty title="暂无随访任务" description="可从患者档案创建随访任务。" />
      )}
      <Pagination current={current} pages={pages} count={tasks.length} onPage={setPage} />
    </section>
  )
}

function HistoryReviewModal({
  patient,
  note,
  onClose,
  onSave,
}: {
  patient: HistoricalPatient
  note?: Note
  onClose: () => void
  onSave: (note: Note) => boolean
}) {
  const [status, setStatus] = useState(note?.status ?? 'needs_info')
  const [text, setText] = useState(note?.text ?? '')
  const [error, setError] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim().length < 4) {
      setError('请填写至少 4 个字符的核对意见。')
      return
    }
    if (onSave({ status, text: text.trim(), at: new Date().toISOString() })) onClose()
    else setError('保存失败，记录未更新。请检查浏览器存储或先恢复损坏的本地流程。')
  }
  return (
    <Modal title="记录评分核对" subtitle={`患者 ${patient.id}`} onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <label className="field">
          核对结论
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(noteLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          核对意见
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            minLength={4}
            maxLength={1000}
            required
            rows={4}
            placeholder="说明同日差异、待补充的就诊编号或核对结果。"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button className="btn" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="submit">
            保存核对意见
          </button>
        </div>
      </form>
    </Modal>
  )
}
function HistoryTaskModal({
  data,
  patientId,
  onClose,
  onSave,
}: {
  data: HistoricalDataset
  patientId: string
  onClose: () => void
  onSave: (task: LocalTask) => boolean
}) {
  const [selected, setSelected] = useState(patientId)
  const [title, setTitle] = useState('历史档案随访任务')
  const [dueDate, setDueDate] = useState(today())
  const [error, setError] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || dueDate < today()) {
      setError('请填写任务名称，并选择不早于今天的日期。')
      return
    }
    if (
      onSave({
        id: crypto.randomUUID(),
        patientId: selected,
        title: title.trim(),
        dueDate,
        status: 'pending',
        records: [],
      })
    )
      onClose()
    else setError('保存失败，任务未创建。请检查浏览器存储或先恢复损坏的本地流程。')
  }
  return (
    <Modal title="新建随访任务" subtitle="选择患者并安排计划日期。" onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <label className="field">
          患者
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {data.patients.map((p) => (
              <option value={p.id} key={p.id}>
                患者 {p.id}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          任务名称
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
        </label>
        <label className="field">
          计划日期
          <input
            type="date"
            value={dueDate}
            min={today()}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button className="btn" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="submit">
            创建随访任务
          </button>
        </div>
      </form>
    </Modal>
  )
}
function HistoryRecordModal({
  task,
  onClose,
  onSave,
}: {
  task: LocalTask
  onClose: () => void
  onSave: (contact: string, text: string, done: boolean, dueDate: string) => boolean
}) {
  const [contact, setContact] = useState('已联系')
  const [text, setText] = useState('')
  const [done, setDone] = useState(true)
  const [dueDate, setDueDate] = useState(today())
  const [error, setError] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim().length < 4 || (!done && dueDate < today())) {
      setError('请填写至少 4 个字符，并检查下次日期。')
      return
    }
    if (onSave(contact, text.trim(), done, dueDate)) onClose()
    else setError('保存失败，记录未更新。请检查浏览器存储或先恢复损坏的本地流程。')
  }
  return (
    <Modal title="填写随访记录" subtitle={`${task.title}`} onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <label className="field">
          联系结果
          <select
            value={contact}
            onChange={(e) => {
              setContact(e.target.value)
              if (e.target.value !== '已联系') setDone(false)
            }}
          >
            <option>已联系</option>
            <option>未接通</option>
            <option>需再次联系</option>
          </select>
        </label>
        <label className="field">
          处理记录
          <textarea
            required
            minLength={4}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            disabled={contact !== '已联系'}
            checked={done && contact === '已联系'}
            onChange={(e) => setDone(e.target.checked)}
          />
          结束本次任务
        </label>
        {!done && (
          <label className="field">
            下次处理日期
            <input
              type="date"
              value={dueDate}
              min={today()}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button className="btn" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="submit">
            保存随访记录
          </button>
        </div>
      </form>
    </Modal>
  )
}
