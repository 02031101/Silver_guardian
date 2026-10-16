import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronRight,
  FileSearch,
  Search,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  AriaComponent,
  GridComponent,
  MarkAreaComponent,
  TooltipComponent,
} from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { LabSeries, Patient, ReviewStatus, Risk } from './types'
import { REVIEW_LABELS, RISK_LABELS, useStore } from './store'

echarts.use([
  LineChart,
  AriaComponent,
  GridComponent,
  MarkAreaComponent,
  TooltipComponent,
  SVGRenderer,
])

export function Avatar({
  patient,
  size = 'normal',
}: {
  patient: Patient
  size?: 'normal' | 'large' | 'small'
}) {
  return (
    <span className={`avatar ${patient.color} ${size}`} aria-hidden="true">
      {patient.avatar}
    </span>
  )
}
export function RiskBadge({ risk }: { risk: Risk }) {
  return (
    <span className={`badge risk-${risk}`}>
      <span className="status-dot" />
      {RISK_LABELS[risk]}
    </span>
  )
}
export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <span className={`review-badge review-${status}`}>{REVIEW_LABELS[status]}</span>
}
export function Empty({
  title = '没有找到相关记录',
  description = '试试调整筛选条件。',
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <FileSearch size={30} strokeWidth={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  )
}
export function PanelTitle({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="modal-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-btn" aria-label="关闭弹窗" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function SearchInput({
  value,
  onChange,
  placeholder = '搜索患者姓名或编号',
  label = '搜索患者',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label?: string
}) {
  return (
    <label className="search-input">
      <Search size={17} />
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button
          className="clear-search"
          type="button"
          onClick={() => onChange('')}
          aria-label="清除搜索"
        >
          <X size={14} />
        </button>
      )}
    </label>
  )
}
export function PatientTable({
  patients,
  compact = false,
}: {
  patients: Patient[]
  compact?: boolean
}) {
  const { local } = useStore()
  if (!patients.length) return <Empty />
  return (
    <div className="table-scroll">
      <table className={`patient-table ${compact ? 'compact' : ''}`}>
        <thead>
          <tr>
            <th>患者信息</th>
            <th>主要共病</th>
            <th>关注等级</th>
            {!compact && <th>出院日期</th>}
            <th>复核状态</th>
            <th>
              <span className="sr-only">查看详情</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {patients.map((p) => (
            <tr key={p.id}>
              <td>
                <Link className="patient-cell" to={`/patients/${p.id}`}>
                  <Avatar patient={p} />
                  <span>
                    <strong>
                      {p.name}
                      <small>{p.id}</small>
                    </strong>
                    <span className="cell-meta">
                      {p.age} 岁<span className="separator">·</span>
                      {p.sex}
                    </span>
                  </span>
                </Link>
              </td>
              <td>
                <div className="disease-tags">
                  {p.diseases.slice(0, compact ? 2 : 3).map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                  {compact && p.diseases.length > 2 && <span>+{p.diseases.length - 2}</span>}
                </div>
              </td>
              <td>
                <RiskBadge risk={p.risk} />
              </td>
              {!compact && <td className="date-text">{p.dischargeDate}</td>}
              <td>
                <ReviewBadge status={local.reviews[p.id].status} />
              </td>
              <td>
                <Link
                  className="table-arrow"
                  to={`/patients/${p.id}`}
                  aria-label={`查看${p.name}的健康档案`}
                >
                  <ChevronRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
export function LabChart({ series, dates }: { series: LabSeries; dates: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' })
    const minimum = Math.floor(Math.min(...series.values, series.reference[0]) * 0.8)
    const maximum = Math.ceil(Math.max(...series.values, series.reference[1]) * 1.1)
    chart.setOption({
      animationDuration: 450,
      aria: { enabled: true, description: `${series.label}历史记录，全部为模拟数据。` },
      grid: { left: 48, right: 20, top: 24, bottom: 40 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#e2e9e8',
        textStyle: { color: '#243d40', fontSize: 12 },
        valueFormatter: (v: number) => `${v} ${series.unit}`,
      },
      xAxis: {
        type: 'category',
        data: dates.map((d) => d.slice(5).replace('-', '/')),
        boundaryGap: false,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e5eceb' } },
        axisLabel: { color: '#82918f', margin: 14, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        min: minimum,
        max: maximum,
        splitNumber: 4,
        axisLabel: { color: '#82918f', fontSize: 11 },
        splitLine: { lineStyle: { color: '#edf1ef', type: 'dashed' } },
      },
      series: [
        {
          name: `${series.label}（模拟）`,
          type: 'line',
          data: series.values,
          smooth: false,
          symbol: 'circle',
          symbolSize: 8,
          showSymbol: true,
          lineStyle: { width: 3, color: '#218b7d' },
          itemStyle: { color: '#218b7d', borderColor: '#fff', borderWidth: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#218b7d18' },
              { offset: 1, color: '#218b7d00' },
            ]),
          },
          markArea: {
            silent: true,
            itemStyle: { color: '#21977b0b' },
            data: [[{ yAxis: series.reference[0] }, { yAxis: series.reference[1] }]],
          },
        },
      ],
    })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [series, dates])
  return (
    <div
      className="lab-chart"
      ref={ref}
      role="img"
      aria-label={`${series.label}趋势：${series.values.join('、')} ${series.unit}。参考范围 ${series.reference.join('—')} ${series.unit}。模拟数据。`}
    />
  )
}
export function FactorList({
  patient,
  detailed = false,
}: {
  patient: Patient
  detailed?: boolean
}) {
  return (
    <div className={`factor-list ${detailed ? 'detailed' : ''}`}>
      {patient.factors.map((f, i) => (
        <div className="factor-row" key={f.name}>
          <span className={`factor-number ${f.direction}`}>
            {f.direction === 'up' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
          </span>
          <div className="factor-content">
            <div className="factor-top">
              <span>{f.name}</span>
              <span>{f.direction === 'up' ? '关注依据' : '缓和因素'}</span>
            </div>
            {detailed && <p>{f.detail}</p>}
            <div className="factor-track">
              <span
                className={f.direction}
                style={
                  {
                    width: `${(f.contribution / 0.36) * 100}%`,
                    animationDelay: `${i * 70}ms`,
                  } as CSSProperties
                }
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
export function ActionLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowRight size={15} />
    </Link>
  )
}
export function CheckBullet({ children }: { children: ReactNode }) {
  return (
    <div className="check-bullet">
      <Check size={16} />
      {children}
    </div>
  )
}
