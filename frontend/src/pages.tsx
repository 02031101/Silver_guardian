import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileCheck2,
  FileText,
  HeartPulse,
  Info,
  ListFilter,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react'
import {
  ActionLink,
  Avatar,
  Empty,
  FactorList,
  LabChart,
  PageHeading,
  PanelTitle,
  PatientTable,
  ReviewBadge,
  RiskBadge,
  SearchInput,
} from './components'
import { CreateTaskModal, RecordModal, ReviewModal } from './forms'
import { appendEvent, isOverdue, REVIEW_LABELS, RISK_LABELS, TASK_LABELS, useStore } from './store'
import type { MetricKey, Patient, Task } from './types'

const scoreOrder = (a: Patient, b: Patient) => b.score - a.score
const shortDate = (date: string) => date.slice(5).replace('-', '/')

export function Dashboard() {
  const { data, local } = useStore()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'priority' | 'pending'>('priority')
  const pending = data.patients.filter((p) => local.reviews[p.id].status === 'pending')
  const todayTasks = local.tasks.filter((t) => t.dueDate === data.demoDate)
  const completed = todayTasks.filter((t) => t.status === 'completed').length
  const overdue = local.tasks.filter((t) => isOverdue(t, data.demoDate))
  const progress = todayTasks.length ? Math.round((completed / todayTasks.length) * 100) : 0
  const focus = (
    filter === 'priority' ? data.patients.filter((p) => p.risk !== 'routine') : pending
  )
    .sort(scoreOrder)
    .slice(0, 5)
  const due = local.tasks
    .filter((t) => t.status !== 'completed' && t.dueDate <= data.demoDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4)
  const risks = (['priority', 'attention', 'routine'] as const).map((risk) => ({
    risk,
    count: data.patients.filter((p) => p.risk === risk).length,
  }))
  let offset = 0
  const rings = risks.map(({ risk, count }) => {
    const result = { risk, count, offset, length: (count / data.patients.length) * 251.3 }
    offset += result.length
    return result
  })
  const dates = [-2, -1, 0, 1, 2, 3, 4].map((n) => {
    const d = new Date(`${data.demoDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  })
  const schedule = dates.map((date) => ({
    date,
    count: local.tasks.filter((t) => t.dueDate === date).length,
    completed: local.tasks.filter((t) => t.dueDate === date && t.status === 'completed').length,
  }))
  const maxCount = Math.max(...schedule.map((s) => s.count), 1)
  const metrics = [
    {
      label: '在管患者',
      value: data.patients.length,
      unit: '人',
      icon: Users,
      color: 'teal',
      detail: `${data.patients.filter((p) => p.diseases.length > 1).length} 位多病共存患者`,
      to: '/patients',
      label2: '查看档案',
    },
    {
      label: '待复核预警',
      value: pending.length,
      unit: '项',
      icon: ShieldCheck,
      color: 'amber',
      detail: '等待医护人员确认与处理',
      to: '/reviews',
      label2: '去复核',
    },
    {
      label: '今日随访',
      value: todayTasks.length,
      unit: '项',
      icon: ClipboardList,
      color: 'blue',
      detail: `已完成 ${completed} 项，待完成 ${todayTasks.length - completed} 项`,
      to: '/followups?scope=today',
      label2: '查看任务',
    },
    {
      label: '逾期任务',
      value: overdue.length,
      unit: '项',
      icon: Clock3,
      color: 'rose',
      detail: overdue.length ? '需要重新安排处理时间' : '所有任务均按计划推进',
      to: '/followups?scope=overdue',
      label2: '及时跟进',
    },
  ]
  return (
    <>
      <PageHeading
        eyebrow="CARE OVERVIEW / 医护工作台"
        title="每一份关注，都有后续。"
        description="您好，陈医生。这里是您今天的患者管理与随访概览。"
        actions={
          <div className="date-chip">
            <CalendarDays size={17} />
            <div>
              <strong>{data.demoDate.replaceAll('-', '.')}</strong>
              <span>星期五 · 演示基准日</span>
            </div>
          </div>
        }
      />
      <div className="metrics-grid">
        {metrics.map((m) => (
          <button key={m.label} className={`metric-card ${m.color}`} onClick={() => navigate(m.to)}>
            <div className="metric-top">
              <span>{m.label}</span>
              <span className={`metric-icon ${m.color}`}>
                <m.icon size={19} strokeWidth={1.8} />
              </span>
            </div>
            <div className="metric-value">
              {m.value}
              <span>{m.unit}</span>
            </div>
            <div className="metric-bottom">
              <span>{m.detail}</span>
              <ArrowUpRight size={15} aria-label={m.label2} />
            </div>
          </button>
        ))}
      </div>
      <div className="dashboard-main">
        <section className="panel focus-panel">
          <PanelTitle
            title="重点关注患者"
            subtitle="从风险到行动，及时关注每一个变化。"
            action={<ActionLink to="/patients">全部患者</ActionLink>}
          />
          <div className="panel-tabs">
            <button
              className={filter === 'priority' ? 'active' : ''}
              onClick={() => setFilter('priority')}
            >
              优先与持续关注<span>{data.patients.filter((p) => p.risk !== 'routine').length}</span>
            </button>
            <button
              className={filter === 'pending' ? 'active' : ''}
              onClick={() => setFilter('pending')}
            >
              待复核<span>{pending.length}</span>
            </button>
            <span className="sort-note">
              <ListFilter size={13} />
              按模拟评分排序
            </span>
          </div>
          <PatientTable patients={focus} compact />
          <div className="panel-footnote">
            <Info size={13} />
            关注等级来自演示分组，不能作为临床风险阈值。
          </div>
        </section>
        <section className="panel today-panel">
          <PanelTitle
            title="今日待办"
            action={<span className="tiny-label">{due.length} 项待跟进</span>}
          />
          <div className="daily-progress">
            <div>
              <span>今日随访完成度</span>
              <strong>
                {progress}
                <small>%</small>
              </strong>
            </div>
            <div className="progress-track">
              <span style={{ width: `${progress}%` }} />
            </div>
            <p>
              已完成 {completed} / {todayTasks.length} 项，按计划推进每一次联系。
            </p>
          </div>
          <div className="today-task-list">
            {due.length ? (
              due.map((task) => {
                const p = data.patients.find((p) => p.id === task.patientId)!
                return (
                  <Link to={`/followups?task=${task.id}`} key={task.id} className="today-task">
                    <span
                      className={`task-square ${isOverdue(task, data.demoDate) ? 'overdue' : ''}`}
                    >
                      <ClipboardCheck size={16} />
                    </span>
                    <div>
                      <strong>{task.title}</strong>
                      <p>
                        {p.name}
                        <span>·</span>
                        {task.owner}
                      </p>
                    </div>
                    <span className={`task-due ${isOverdue(task, data.demoDate) ? 'overdue' : ''}`}>
                      {isOverdue(task, data.demoDate) ? '逾期' : '今日'}
                      <ChevronRight size={13} />
                    </span>
                  </Link>
                )
              })
            ) : (
              <Empty title="今日待办已处理" description="可以查看后续随访安排。" />
            )}
          </div>
          <Link className="all-tasks-link" to="/followups">
            进入随访任务中心
            <ArrowRight size={15} />
          </Link>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel distribution-panel">
          <PanelTitle title="患者关注分布" subtitle="当前在管患者 · 模拟分组" />
          <div className="distribution-content">
            <div className="donut">
              <svg viewBox="0 0 110 110" aria-label="关注等级分布">
                <circle cx="55" cy="55" r="40" fill="none" stroke="#eff3f1" strokeWidth="12" />
                {rings.map((r) => (
                  <circle
                    key={r.risk}
                    className={`ring-${r.risk}`}
                    cx="55"
                    cy="55"
                    r="40"
                    fill="none"
                    strokeWidth="12"
                    strokeDasharray={`${r.length - 3} ${251.3 - r.length + 3}`}
                    strokeDashoffset={-r.offset}
                    transform="rotate(-90 55 55)"
                  />
                ))}
              </svg>
              <div>
                <strong>{data.patients.length}</strong>
                <span>在管患者</span>
              </div>
            </div>
            <div className="donut-legend">
              {risks.map((r) => (
                <Link to={`/patients?risk=${r.risk}`} key={r.risk}>
                  <span className={`legend-dot ${r.risk}`} />
                  {RISK_LABELS[r.risk]}
                  <strong>
                    {r.count}
                    <small>人</small>
                  </strong>
                </Link>
              ))}
            </div>
          </div>
        </section>
        <section className="panel schedule-panel">
          <PanelTitle
            title="随访计划分布"
            subtitle="演示基准日前后 7 天的计划任务"
            action={
              <span className="chart-key">
                <i />
                计划任务
              </span>
            }
          />
          <div className="schedule-chart">
            {schedule.map((s) => (
              <div
                className={`schedule-column ${s.date === data.demoDate ? 'today' : ''}`}
                key={s.date}
              >
                <span className="bar-count">{s.count}</span>
                <div className="bar-area">
                  <span
                    style={{
                      height: s.count ? `${Math.max(8, (s.count / maxCount) * 100)}%` : '3px',
                    }}
                    title={`${s.date}：${s.count} 项，完成 ${s.completed} 项`}
                  />
                </div>
                <span className="bar-label">
                  {shortDate(s.date)}
                  {s.date === data.demoDate && <small>今天</small>}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="care-note">
          <span className="care-note-icon">
            <HeartPulse size={26} />
          </span>
          <span className="eyebrow">CONNECTED CARE</span>
          <h2>
            让健康管理，
            <br />
            连接每一个阶段。
          </h2>
          <p>
            从出院评估到随访反馈，
            <br />
            让关怀有迹可循。
          </p>
          <Link to="/patients">
            查看患者档案
            <ArrowUpRight size={17} />
          </Link>
          <div className="care-circles" aria-hidden="true" />
        </section>
      </div>
    </>
  )
}

export function Patients() {
  const { data, local } = useStore()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const risk = params.get('risk') ?? 'all'
  const [review, setReview] = useState('all')
  const [disease, setDisease] = useState('all')
  const [sort, setSort] = useState('score')
  const diseases = [...new Set(data.patients.flatMap((p) => p.diseases))]
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (!value || value === 'all') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }
  const filtered = data.patients
    .filter(
      (p) =>
        (!query.trim() ||
          `${p.name} ${p.id} ${p.diseases.join(' ')}`
            .toLowerCase()
            .includes(query.trim().toLowerCase())) &&
        (risk === 'all' || p.risk === risk) &&
        (review === 'all' || local.reviews[p.id].status === review) &&
        (disease === 'all' || p.diseases.includes(disease)),
    )
    .sort(sort === 'score' ? scoreOrder : (a, b) => b.dischargeDate.localeCompare(a.dischargeDate))
  return (
    <>
      <PageHeading
        eyebrow="PATIENT DIRECTORY / 患者档案"
        title="连续的记录，完整的关怀。"
        description="将诊疗信息、检验趋势与随访记录，整合为一份清晰的健康档案。"
        actions={
          <div className="heading-count">
            <Users size={20} />
            <strong>{data.patients.length}</strong>
            <span>份演示档案</span>
          </div>
        }
      />
      <section className="panel directory-panel">
        <div className="directory-tabs">
          <button className={risk === 'all' ? 'active' : ''} onClick={() => update('risk', 'all')}>
            全部患者<span>{data.patients.length}</span>
          </button>
          {(['priority', 'attention', 'routine'] as const).map((r) => (
            <button
              key={r}
              className={risk === r ? 'active' : ''}
              onClick={() => update('risk', r)}
            >
              <span className={`legend-dot ${r}`} />
              {RISK_LABELS[r]}
              <span>{data.patients.filter((p) => p.risk === r).length}</span>
            </button>
          ))}
        </div>
        <div className="filter-toolbar">
          <SearchInput
            value={query}
            onChange={(v) => update('q', v)}
            placeholder="搜索姓名、编号或疾病"
          />
          <div className="filter-selects">
            <label>
              <span className="sr-only">疾病筛选</span>
              <select
                aria-label="疾病筛选"
                value={disease}
                onChange={(e) => setDisease(e.target.value)}
              >
                <option value="all">全部疾病</option>
                {diseases.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">复核状态</span>
              <select
                aria-label="复核状态"
                value={review}
                onChange={(e) => setReview(e.target.value)}
              >
                <option value="all">全部复核状态</option>
                {Object.entries(REVIEW_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <select aria-label="排序方式" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="score">模拟评分从高到低</option>
              <option value="date">最近出院优先</option>
            </select>
          </div>
        </div>
        <PatientTable patients={filtered} />
        <div className="table-footer">
          <span>
            共 {filtered.length} 份档案<span className="separator">/</span>全部{' '}
            {data.patients.length} 份
          </span>
          <span>
            <span className="small-green-dot" />
            本地演示数据
          </span>
        </div>
      </section>
      <div className="bottom-note">
        <ShieldCheck size={15} />
        所有患者均为虚拟人物，姓名、检验数值和模型评分仅用于演示。
      </div>
    </>
  )
}

export function PatientDetail() {
  const { id } = useParams()
  const { data, local } = useStore()
  const patient = data.patients.find((p) => p.id === id)
  const [metric, setMetric] = useState<MetricKey>('hemoglobin')
  const [tab, setTab] = useState('overview')
  const [create, setCreate] = useState(false)
  const [review, setReview] = useState(false)
  if (!patient)
    return (
      <Empty
        title="没有找到这份档案"
        description="患者编号不存在，请返回患者列表选择。"
        action={
          <Link className="btn primary" to="/patients">
            返回患者档案
          </Link>
        }
      />
    )
  const p = patient
  const series = p.labs[metric]
  const last = series.values.at(-1)!
  const delta = +(last - series.values.at(-2)!).toFixed(1)
  const outOfRange = last < series.reference[0] || last > series.reference[1]
  const tasks = local.tasks.filter((t) => t.patientId === p.id)
  const records = tasks
    .flatMap((t) => t.records.map((r) => ({ ...r, taskTitle: t.title })))
    .sort((a, b) => b.at.localeCompare(a.at))
  const events = local.events.filter((e) => e.patientId === p.id)
  return (
    <>
      <div className="detail-breadcrumb">
        <Link to="/patients">
          <ArrowLeft size={15} />
          患者档案
        </Link>
        <ChevronRight size={13} />
        <span>{p.name}的健康档案</span>
      </div>
      <section className="patient-profile">
        <div className="profile-identity">
          <Avatar patient={p} size="large" />
          <div>
            <div className="profile-name">
              <h1>{p.name}</h1>
              <span className="neutral-pill">虚拟患者</span>
              <RiskBadge risk={p.risk} />
            </div>
            <p>
              {p.id}
              <span>·</span>
              {p.age} 岁<span>·</span>
              {p.sex}
              <span>·</span>
              {p.department}
            </p>
            <div className="profile-diseases">
              {p.diseases.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <button className="btn" onClick={() => setReview(true)}>
            <FileCheck2 size={16} />
            记录复核
          </button>
          <button className="btn primary" onClick={() => setCreate(true)}>
            <Plus size={16} />
            新建随访
          </button>
        </div>
      </section>
      <div className="profile-summary">
        <span>
          <CalendarDays size={15} />
          出院日期<strong>{p.dischargeDate}</strong>
        </span>
        <span>
          <Stethoscope size={15} />
          管理负责人<strong>{p.owner}</strong>
        </span>
        <span>
          <Activity size={15} />
          分析标签<strong>{p.group}</strong>
          <small>模拟分组</small>
        </span>
        <span>
          <ClipboardCheck size={15} />
          随访任务<strong>{tasks.filter((t) => t.status !== 'completed').length} 项未完成</strong>
        </span>
      </div>
      <div className="detail-tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
          健康概览
        </button>
        <button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>
          诊疗与处理时间线
        </button>
        <button className={tab === 'followups' ? 'active' : ''} onClick={() => setTab('followups')}>
          随访记录<span>{records.length}</span>
        </button>
      </div>
      {tab === 'overview' && (
        <>
          <div className="detail-main">
            <section className="panel lab-panel">
              <PanelTitle
                title="关键检验趋势"
                subtitle="历史观测 · 全部为模拟检验记录"
                action={<span className="neutral-pill">{series.unit}</span>}
              />
              <div className="lab-tabs">
                {(Object.keys(p.labs) as MetricKey[]).map((key) => (
                  <button
                    key={key}
                    className={metric === key ? 'active' : ''}
                    onClick={() => setMetric(key)}
                  >
                    {p.labs[key].label}
                  </button>
                ))}
              </div>
              <div className="lab-summary">
                <div>
                  <span>最近一次{series.label}</span>
                  <strong className={outOfRange ? 'warning-text' : ''}>
                    {last}
                    <small>{series.unit}</small>
                  </strong>
                </div>
                <span className={`measurement-change ${outOfRange ? 'warning' : ''}`}>
                  {delta < 0 ? <ArrowDownRight size={15} /> : <ArrowUpRight size={15} />}
                  {Math.abs(delta)}
                  <small>较上次</small>
                </span>
                <div className="lab-reference">
                  <i />
                  参考范围 {series.reference.join('–')} {series.unit}
                  <small>演示用固定范围</small>
                </div>
              </div>
              <LabChart series={series} dates={p.labDates} />
              <div className="chart-footer">
                <span>
                  <i className="solid-line" />
                  模拟观测值
                </span>
                <span>
                  <i className="range-block" />
                  参考范围
                </span>
                <span>最近记录 {p.labDates.at(-1)}</span>
              </div>
              <details className="lab-data-details">
                <summary>查看检验数值表</summary>
                <table>
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>
                        {series.label}（{series.unit}）
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.labDates.map((date, i) => (
                      <tr key={date}>
                        <td>{date}</td>
                        <td>{series.values[i]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
            <section className="panel risk-card">
              <PanelTitle
                title="出院风险评估"
                action={<span className="demo-tag small">模拟结果</span>}
              />
              <div className="score-display">
                <div
                  className={`score-orbit ${p.risk}`}
                  style={{
                    background: `conic-gradient(${p.risk === 'routine' ? '#82a988' : p.risk === 'attention' ? '#b9b884' : '#c5a47c'} ${p.score * 360}deg, #f7eee2 0deg)`,
                  }}
                >
                  <strong>
                    {Math.round(p.score * 100)}
                    <small>/ 100</small>
                  </strong>
                </div>
                <div>
                  <RiskBadge risk={p.risk} />
                  <p>模拟评分 · 非事件概率</p>
                </div>
              </div>
              <div className="assessment-meta">
                <span>
                  目标<strong>出院后 30 天再入院</strong>
                </span>
                <span>
                  基准时间<strong>{p.assessedAt}</strong>
                </span>
                <span>
                  模型版本<strong>demo-v1 · 待验证</strong>
                </span>
              </div>
              <div className="subsection-title">
                本次评分的示意依据<span>非因果解释</span>
              </div>
              <FactorList patient={p} />
              <Link className="risk-detail-link" to={`/reviews?patient=${p.id}`}>
                查看依据与复核
                <ArrowRight size={15} />
              </Link>
            </section>
          </div>
          <div className="detail-bottom">
            <section className="panel">
              <PanelTitle
                title="数据完整性"
                subtitle="演示字段覆盖情况，不代表临床可用性"
                action={
                  <strong className="completeness-number">
                    {p.completeness}
                    <small>%</small>
                  </strong>
                }
              />
              <div className="completeness-track">
                <span style={{ width: `${p.completeness}%` }} />
              </div>
              <div className="missing-data">
                {p.missing.length ? (
                  <>
                    <span>
                      <Info size={16} />
                      仍需补充的信息
                    </span>
                    <div>
                      {p.missing.map((m) => (
                        <span key={m}>{m}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="success-text">
                    <CheckCheck size={17} />
                    演示字段已齐全，仍需结合实际记录复核。
                  </span>
                )}
              </div>
            </section>
            <section className="panel">
              <PanelTitle
                title="最近一次人工复核"
                action={<ReviewBadge status={local.reviews[p.id].status} />}
              />
              <p className="review-note">
                {local.reviews[p.id].note || '这份评估尚未完成医护复核，请查看风险依据并记录判断。'}
              </p>
              <div className="review-note-footer">
                <span>
                  {local.reviews[p.id].status === 'pending'
                    ? '等待医护确认'
                    : `${local.reviews[p.id].author} · ${local.reviews[p.id].at}`}
                </span>
                <button className="text-link" onClick={() => setReview(true)}>
                  记录复核
                  <ArrowRight size={14} />
                </button>
              </div>
            </section>
          </div>
        </>
      )}
      {tab === 'timeline' && (
        <section className="panel timeline-panel">
          <PanelTitle title="诊疗与处理时间线" subtitle="观察记录与人工处理记录按时间排列" />
          <div className="clinical-timeline">
            {[
              ...p.timeline.map((e) => ({ ...e, id: e.date + e.title })),
              ...events.map((e) => ({
                id: e.id,
                date: e.at,
                title: e.title,
                description: e.detail,
                type: 'action',
              })),
            ]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((e) => (
                <div key={e.id} className={`timeline-item ${e.type}`}>
                  <span className="timeline-dot">
                    {e.type === 'action' ? (
                      <ClipboardCheck size={16} />
                    ) : e.type === 'lab' ? (
                      <Activity size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                  </span>
                  <div>
                    <time>{e.date}</time>
                    <h3>{e.title}</h3>
                    <p>{e.description}</p>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}
      {tab === 'followups' && (
        <section className="panel">
          <PanelTitle
            title="随访记录"
            subtitle="按最近记录时间排列，保留每次联系结果"
            action={
              <button className="btn small" onClick={() => setCreate(true)}>
                <Plus size={15} />
                新建任务
              </button>
            }
          />
          {records.length ? (
            <div className="record-list">
              {records.map((r) => (
                <div className="record-item" key={r.id}>
                  <span className="record-icon">
                    <MessageSquareText size={19} />
                  </span>
                  <div>
                    <div className="record-title">
                      <h3>{r.taskTitle}</h3>
                      <span className="neutral-pill">{r.contact}</span>
                    </div>
                    <p>{r.note}</p>
                    <div className="record-next">后续安排：{r.action}</div>
                    <small>
                      {r.author} · {r.at}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="还没有随访记录"
              description="完成联系后，在任务中心填写记录，处理过程将在这里保留。"
              action={
                <Link className="btn" to={`/followups?patient=${p.id}`}>
                  查看该患者任务
                  <ArrowRight size={15} />
                </Link>
              }
            />
          )}
        </section>
      )}
      <div className="bottom-note">
        <Info size={14} />
        本页为虚拟患者演示。模型评分、分组和影响因素均为示意，尚未接入真实模型结果。
      </div>
      {create && <CreateTaskModal patientId={p.id} onClose={() => setCreate(false)} />}
      {review && <ReviewModal patient={p} onClose={() => setReview(false)} />}
    </>
  )
}

export function Reviews() {
  const { data, local } = useStore()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState(params.has('patient') ? 'all' : 'pending')
  const [query, setQuery] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const selectedId = params.get('patient')
  const patients = data.patients
    .filter(
      (p) =>
        (status === 'all' || local.reviews[p.id].status === status) &&
        `${p.name} ${p.id}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(scoreOrder)
  const selected = patients.find((p) => p.id === selectedId) ?? patients[0]
  const pendingCount = data.patients.filter((p) => local.reviews[p.id].status === 'pending').length
  return (
    <>
      <PageHeading
        eyebrow="RISK REVIEW / 风险复核"
        title="理解依据，再做判断。"
        description="查看风险提示和原始记录，保留每一次医护判断与处理意见。"
        actions={
          <span className="heading-status">
            <span />
            {pendingCount} 项评估等待复核
          </span>
        }
      />
      <div className="review-workspace">
        <aside className="panel review-queue">
          <div className="queue-heading">
            <h2>评估队列</h2>
            <span>{patients.length} 位患者</span>
          </div>
          <div className="queue-filters">
            <select
              aria-label="评估队列状态"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">全部评估</option>
              {Object.entries(REVIEW_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="搜索患者"
              label="搜索评估患者"
            />
          </div>
          <div className="queue-list">
            {patients.length ? (
              patients.map((p) => (
                <button
                  key={p.id}
                  className={`queue-patient ${selected?.id === p.id ? 'active' : ''}`}
                  onClick={() => setParams({ patient: p.id }, { replace: true })}
                >
                  <div className="queue-patient-top">
                    <Avatar patient={p} size="small" />
                    <strong>
                      {p.name}
                      <small>
                        {p.age} 岁 · {p.id}
                      </small>
                    </strong>
                    <span className={`queue-score ${p.risk}`}>
                      {Math.round(p.score * 100)}
                      <small>分</small>
                    </span>
                  </div>
                  <div className="queue-patient-bottom">
                    <RiskBadge risk={p.risk} />
                    <span>{REVIEW_LABELS[local.reviews[p.id].status]}</span>
                  </div>
                </button>
              ))
            ) : (
              <Empty title="暂无此类评估" description="切换筛选查看其他记录。" />
            )}
          </div>
        </aside>
        {selected ? (
          <section className="panel review-detail">
            <div className="review-detail-header">
              <div className="review-detail-person">
                <Avatar patient={selected} />
                <div>
                  <h2>
                    {selected.name}
                    <span>{selected.id}</span>
                  </h2>
                  <p>
                    {selected.age} 岁 · {selected.sex} · {selected.diseases.join('、')}
                  </p>
                </div>
              </div>
              <ActionLink to={`/patients/${selected.id}`}>完整档案</ActionLink>
            </div>
            <div className="review-assessment-banner">
              <span className="review-assessment-icon">
                <ShieldCheck size={29} />
              </span>
              <div>
                <span className="eyebrow">出院后 30 天再入院 · 模拟评估</span>
                <h3>
                  模型评分 <strong>{Math.round(selected.score * 100)}</strong>
                  <small>/ 100</small>
                </h3>
                <p>评分不等于个人再入院概率，需结合临床记录人工复核。</p>
              </div>
              <RiskBadge risk={selected.risk} />
            </div>
            <div className="review-evidence-meta">
              <span>
                预测基准<strong>{selected.assessedAt}</strong>
              </span>
              <span>
                最近检验<strong>{selected.labDates.at(-1)}</strong>
              </span>
              <span>
                分析版本<strong>demo-v1 · 待重新验证</strong>
              </span>
            </div>
            <div className="review-section-heading">
              <h3>为什么被提示关注？</h3>
              <span className="neutral-pill">模拟解释 · 非实时 SHAP</span>
            </div>
            <FactorList patient={selected} detailed />
            <div className="review-data-note">
              <Info size={17} />
              <div>
                <strong>
                  {selected.missing.length ? '判断前，请留意信息缺口' : '请核对原始记录与评估时间'}
                </strong>
                <p>
                  {selected.missing.length
                    ? `尚缺：${selected.missing.join('、')}。缺失信息可能影响判断。`
                    : '演示字段齐全不代表风险评估已具备临床有效性。'}
                </p>
              </div>
            </div>
            <div className="review-last">
              <div>
                <ReviewBadge status={local.reviews[selected.id].status} />
                <span>
                  {local.reviews[selected.id].status === 'pending'
                    ? '尚未记录人工意见'
                    : `${local.reviews[selected.id].author} · ${local.reviews[selected.id].at}`}
                </span>
              </div>
              {local.reviews[selected.id].note && <p>{local.reviews[selected.id].note}</p>}
            </div>
            <div className="review-action-footer">
              <span>
                <ShieldCheck size={15} />
                人工意见与模型结果独立保存
              </span>
              <button className="btn primary" onClick={() => setReviewing(true)}>
                <FileCheck2 size={16} />
                记录复核意见
              </button>
            </div>
          </section>
        ) : (
          <section className="panel review-detail">
            <Empty
              title="队列已处理完毕"
              description="可以切换到全部评估查看历史复核记录。"
              action={
                <button className="btn" onClick={() => setStatus('all')}>
                  查看全部评估
                </button>
              }
            />
          </section>
        )}
      </div>
      {reviewing && selected && (
        <ReviewModal patient={selected} onClose={() => setReviewing(false)} />
      )}
    </>
  )
}

export function Followups() {
  const { data, local, commit, timestamp } = useStore()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [owner, setOwner] = useState('all')
  const [create, setCreate] = useState(false)
  const [recordTaskId, setRecordTaskId] = useState<string | null>(null)
  const scope = params.get('scope') ?? 'all'
  const patientId = params.get('patient')
  const taskId = params.get('task')
  const counts = {
    all: local.tasks.length,
    today: local.tasks.filter((t) => t.dueDate === data.demoDate).length,
    overdue: local.tasks.filter((t) => isOverdue(t, data.demoDate)).length,
    completed: local.tasks.filter((t) => t.status === 'completed').length,
  }
  const filtered = useMemo(
    () =>
      local.tasks
        .filter((t) => {
          const p = data.patients.find((p) => p.id === t.patientId)!
          return (
            (scope !== 'today' || t.dueDate === data.demoDate) &&
            (scope !== 'overdue' || isOverdue(t, data.demoDate)) &&
            (scope !== 'completed' || t.status === 'completed') &&
            (!patientId || t.patientId === patientId) &&
            (!taskId || t.id === taskId) &&
            (status === 'all' || t.status === status) &&
            (owner === 'all' || t.owner === owner) &&
            `${p.name} ${p.id} ${t.title}`.toLowerCase().includes(query.trim().toLowerCase())
          )
        })
        .sort(
          (a, b) =>
            Number(a.status === 'completed') - Number(b.status === 'completed') ||
            a.dueDate.localeCompare(b.dueDate),
        ),
    [local.tasks, data, scope, patientId, taskId, status, owner, query],
  )
  const recordTask = local.tasks.find((t) => t.id === recordTaskId)
  const startTask = (task: Task) => {
    const at = timestamp()
    commit((s) => {
      const target = s.tasks.find((t) => t.id === task.id)!
      target.status = 'in_progress'
      return appendEvent(s, {
        at,
        patientId: task.patientId,
        title: '开始处理随访任务',
        detail: task.title,
      })
    }, '任务已开始，状态已保存')
  }
  const changeScope = (value: string) => {
    const next = new URLSearchParams(params)
    next.delete('task')
    next.delete('patient')
    if (value === 'all') next.delete('scope')
    else next.set('scope', value)
    setParams(next)
    setStatus('all')
  }
  return (
    <>
      <PageHeading
        eyebrow="FOLLOW-UP CENTER / 随访任务"
        title="让关怀，落在每一次联系里。"
        description="安排、记录与跟进，让出院后的健康管理持续向前。"
        actions={
          <button className="btn primary" onClick={() => setCreate(true)}>
            <Plus size={17} />
            新建随访任务
          </button>
        }
      />
      <div className="task-summary-grid">
        {(
          [
            { key: 'all', label: '全部任务', icon: ClipboardList },
            { key: 'today', label: '今日计划', icon: CalendarDays },
            { key: 'overdue', label: '逾期待跟进', icon: Clock3 },
            { key: 'completed', label: '已完成', icon: CheckCheck },
          ] as const
        ).map((m) => (
          <button
            key={m.key}
            className={`task-summary ${scope === m.key ? 'active' : ''} ${m.key}`}
            onClick={() => changeScope(m.key)}
          >
            <span>
              <m.icon size={20} />
              {m.label}
            </span>
            <strong>
              {counts[m.key]}
              <small>项</small>
            </strong>
          </button>
        ))}
      </div>
      <section className="panel tasks-panel">
        <PanelTitle
          title={
            scope === 'today'
              ? '今日随访安排'
              : scope === 'overdue'
                ? '逾期任务'
                : scope === 'completed'
                  ? '已完成任务'
                  : '随访任务列表'
          }
          subtitle={`计划日期以 ${data.demoDate} 为演示基准日`}
          action={<span className="tiny-label">{filtered.length} 条记录</span>}
        />
        <div className="filter-toolbar">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="搜索患者或任务名称"
            label="搜索随访任务"
          />
          <div className="filter-selects">
            <select
              aria-label="任务状态"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">全部任务状态</option>
              {Object.entries(TASK_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="任务负责人"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="all">全部负责人</option>
              <option>陈医生</option>
              <option>李护士</option>
            </select>
          </div>
        </div>
        {(patientId || taskId) && (
          <div className="active-filter">
            <ListFilter size={14} />
            正在查看
            {patientId
              ? `${data.patients.find((p) => p.id === patientId)?.name ?? patientId}的任务`
              : '指定任务'}
            <button onClick={() => setParams({})}>
              清除限定
              <ArrowRight size={13} />
            </button>
          </div>
        )}
        {filtered.length ? (
          <div className="followup-list">
            {filtered.map((task) => {
              const p = data.patients.find((p) => p.id === task.patientId)!
              const overdue = isOverdue(task, data.demoDate)
              return (
                <article className={`followup-card ${task.status}`} key={task.id}>
                  <div className="followup-card-main">
                    <span className={`followup-status-icon ${task.status}`}>
                      {task.status === 'completed' ? (
                        <Check size={21} />
                      ) : task.status === 'in_progress' ? (
                        <Activity size={20} />
                      ) : (
                        <ClipboardList size={20} />
                      )}
                    </span>
                    <div className="followup-content">
                      <div className="followup-title">
                        <h3>{task.title}</h3>
                        <span className={`task-status ${task.status}`}>
                          {TASK_LABELS[task.status]}
                        </span>
                        {overdue && <span className="overdue-label">已逾期</span>}
                      </div>
                      <div className="followup-person">
                        <Link to={`/patients/${p.id}`}>
                          <Avatar patient={p} size="small" />
                          {p.name}
                          <span>{p.id}</span>
                        </Link>
                        <span>
                          {p.age} 岁 · {p.diseases.join('、')}
                        </span>
                      </div>
                      <p className="task-source">
                        <span>关注事项</span>
                        {task.source}
                      </p>
                      <div className="task-meta">
                        <span>
                          <CalendarDays size={14} />
                          计划 {task.dueDate}
                        </span>
                        <span>
                          <Stethoscope size={14} />
                          {task.owner}
                        </span>
                        <span>
                          <MessageSquareText size={14} />
                          {task.records.length} 条记录
                        </span>
                      </div>
                    </div>
                    <div className="task-actions">
                      {task.status === 'pending' && (
                        <button className="btn small" onClick={() => startTask(task)}>
                          开始处理
                          <ArrowRight size={14} />
                        </button>
                      )}
                      {task.status !== 'completed' && (
                        <button
                          className="btn primary small"
                          onClick={() => setRecordTaskId(task.id)}
                        >
                          填写记录
                        </button>
                      )}
                      {task.status === 'completed' && (
                        <Link className="btn small" to={`/patients/${p.id}`}>
                          查看患者档案
                          <ChevronRight size={14} />
                        </Link>
                      )}
                    </div>
                  </div>
                  {task.records.length > 0 && (
                    <details className="task-records">
                      <summary>
                        <FileText size={14} />
                        查看随访记录（{task.records.length}）
                      </summary>
                      <div>
                        {task.records.map((r) => (
                          <div className="task-record" key={r.id}>
                            <div>
                              <strong>{r.contact}</strong>
                              <span>
                                {r.author} · {r.at}
                              </span>
                            </div>
                            <p>{r.note}</p>
                            <p>
                              <span>后续安排：</span>
                              {r.action}
                            </p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <Empty
            title="这里暂时没有任务"
            description="可以调整筛选条件，或为患者安排一次新的随访。"
            action={
              <button className="btn" onClick={() => setCreate(true)}>
                <Plus size={15} />
                新建随访任务
              </button>
            }
          />
        )}
        <div className="table-footer">
          <span>已显示 {filtered.length} 条任务</span>
          <span>
            <span className="small-green-dot" />
            操作记录保存在当前浏览器
          </span>
        </div>
      </section>
      {create && (
        <CreateTaskModal patientId={patientId ?? undefined} onClose={() => setCreate(false)} />
      )}
      {recordTask && <RecordModal task={recordTask} onClose={() => setRecordTaskId(null)} />}
    </>
  )
}
