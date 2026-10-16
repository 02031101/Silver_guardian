import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  Check,
  ClipboardList,
  Database,
  Download,
  FileJson,
  Info,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { Modal, Avatar, CheckBullet } from './components'
import { appendEvent, REVIEW_LABELS, TASK_LABELS, useStore } from './store'
import type { Patient, ReviewStatus, Task } from './types'

export function CreateTaskModal({
  patientId,
  onClose,
}: {
  patientId?: string
  onClose: () => void
}) {
  const { data, local, commit, timestamp } = useStore()
  const [selected, setSelected] = useState(patientId ?? data.patients[0].id)
  const [title, setTitle] = useState('出院后随访')
  const [date, setDate] = useState(data.demoDate)
  const [owner, setOwner] = useState(
    data.patients.find((p) => p.id === selected)?.owner ?? '李护士',
  )
  const [focus, setFocus] = useState('')
  const [error, setError] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !focus.trim()) {
      setError('请填写任务名称和需要核实的关注事项。')
      return
    }
    if (date < data.demoDate) {
      setError('新任务的计划日期不能早于演示日期。')
      return
    }
    if (
      local.tasks.some(
        (t) =>
          t.patientId === selected &&
          t.title === title.trim() &&
          t.dueDate === date &&
          t.status !== 'completed',
      )
    ) {
      setError('该患者当天已有同名未完成任务，请先查看现有任务。')
      return
    }
    const at = timestamp()
    const ok = commit((s) => {
      s.tasks.unshift({
        id: `T-${crypto.randomUUID()}`,
        patientId: selected,
        title: title.trim(),
        dueDate: date,
        owner,
        status: 'pending',
        source: focus.trim(),
        createdAt: at,
        records: [],
      })
      return appendEvent(s, {
        at,
        patientId: selected,
        title: '新建随访任务',
        detail: `${title.trim()} · ${owner}`,
      })
    }, '随访任务已保存到当前浏览器')
    if (ok) onClose()
    else setError('保存失败，记录未更新。请检查浏览器存储权限或剩余空间。')
  }
  return (
    <Modal title="新建随访任务" subtitle="将关注事项落实到一次有记录的随访。" onClose={onClose}>
      <form onSubmit={submit} className="modal-body">
        <div className="form-notice">
          <Info size={16} />
          演示任务仅保存在当前浏览器，不会发送给患者或医护。
        </div>
        <label className="field">
          患者
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value)
              setOwner(data.patients.find((p) => p.id === e.target.value)!.owner)
            }}
          >
            {data.patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.id} · {p.age} 岁
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          任务名称
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={50} required />
        </label>
        <div className="form-grid">
          <label className="field">
            计划日期
            <input
              aria-label="计划日期"
              type="date"
              value={date}
              min={data.demoDate}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="field">
            负责人
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option>李护士</option>
              <option>陈医生</option>
            </select>
          </label>
        </div>
        <label className="field">
          关注事项
          <textarea
            aria-label="关注事项"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="例如：核实近期监测记录、确认是否已安排复查。"
            rows={3}
            maxLength={500}
            required
          />
          <span className="field-hint">由医护人员填写、审核；不自动生成诊疗指令。</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            <AlertCircle size={15} />
            {error}
          </p>
        )}
        <div className="modal-footer">
          <button className="btn" type="button" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" type="submit">
            <ClipboardList size={16} />
            创建任务
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function ReviewModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { data, local, commit, timestamp } = useStore()
  const current = local.reviews[patient.id]
  const [status, setStatus] = useState<ReviewStatus>(
    current.status === 'pending' ? 'confirmed' : current.status,
  )
  const [note, setNote] = useState(current.note)
  const [createTask, setCreateTask] = useState(false)
  const [error, setError] = useState('')
  const hasTask = local.tasks.some((t) => t.patientId === patient.id && t.status !== 'completed')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (note.trim().length < 4) {
      setError('请填写至少 4 个字符的复核意见，说明判断依据或待补充信息。')
      return
    }
    const at = timestamp()
    const ok = commit(
      (s) => {
        s.reviews[patient.id] = { status, note: note.trim(), at, author: '陈医生' }
        if (createTask && !hasTask && status !== 'dismissed')
          s.tasks.unshift({
            id: `T-${crypto.randomUUID()}`,
            patientId: patient.id,
            title: '风险复核后随访',
            dueDate: data.demoDate,
            owner: patient.owner,
            status: 'pending',
            source: note.trim(),
            createdAt: at,
            records: [],
          })
        return appendEvent(s, {
          at,
          patientId: patient.id,
          title: REVIEW_LABELS[status],
          detail: note.trim(),
        })
      },
      createTask && !hasTask && status !== 'dismissed'
        ? '复核已保存，并创建随访任务'
        : '复核意见已保存',
    )
    if (ok) onClose()
    else setError('保存失败，记录未更新。请检查浏览器存储权限或剩余空间。')
  }
  return (
    <Modal
      title="记录医护复核"
      subtitle="人工判断与模型评分独立保存，可在患者档案中追溯。"
      onClose={onClose}
    >
      <form className="modal-body" onSubmit={submit}>
        <div className="review-person">
          <Avatar patient={patient} />
          <div>
            <strong>
              {patient.name} <span>{patient.id}</span>
            </strong>
            <p>
              {patient.age} 岁 · {patient.diseases.join('、')}
            </p>
          </div>
        </div>
        <fieldset className="review-options">
          <legend>复核结论</legend>
          {(['confirmed', 'needs_info', 'dismissed'] as const).map((s) => (
            <label key={s} className={status === s ? 'selected' : ''}>
              <input
                type="radio"
                name="review"
                value={s}
                checked={status === s}
                onChange={() => setStatus(s)}
              />
              <span>
                <strong>{REVIEW_LABELS[s]}</strong>
                <small>
                  {s === 'confirmed'
                    ? '保留关注，纳入后续人工处理'
                    : s === 'needs_info'
                      ? '记录缺失信息，补充后再判断'
                      : '说明原因，保留本次复核记录'}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          复核意见
          <textarea
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="请说明依据、需要补充的信息或暂不采纳的原因。"
            minLength={4}
            maxLength={1000}
            required
          />
        </label>
        {status !== 'dismissed' && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              disabled={hasTask}
              checked={createTask && !hasTask}
              onChange={(e) => setCreateTask(e.target.checked)}
            />
            {hasTask ? '该患者已有未完成随访任务，不重复创建' : '同时创建一条今日随访任务'}
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
            <Check size={16} />
            保存复核意见
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function RecordModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data, commit, timestamp } = useStore()
  const patient = data.patients.find((p) => p.id === task.patientId)!
  const [contact, setContact] = useState('已联系')
  const [note, setNote] = useState('')
  const [action, setAction] = useState('')
  const [complete, setComplete] = useState(true)
  const [date, setDate] = useState(data.demoDate)
  const [error, setError] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (note.trim().length < 4 || action.trim().length < 2) {
      setError('请完整填写随访记录（至少 4 个字符）和后续安排。')
      return
    }
    if (!complete && date < data.demoDate) {
      setError('下一次处理日期不能早于演示日期。')
      return
    }
    const at = timestamp()
    const ok = commit(
      (s) => {
        const target = s.tasks.find((t) => t.id === task.id)!
        target.records.unshift({
          id: crypto.randomUUID(),
          at,
          author: '陈医生',
          contact,
          note: note.trim(),
          action: action.trim(),
        })
        target.status = complete && contact === '已联系' ? 'completed' : 'in_progress'
        if (target.status !== 'completed') target.dueDate = date
        return appendEvent(s, {
          at,
          patientId: task.patientId,
          title: target.status === 'completed' ? '完成随访任务' : '更新随访记录',
          detail: `${task.title} · ${contact}`,
        })
      },
      complete && contact === '已联系' ? '记录已保存，任务已完成' : '记录已保存，任务保持进行中',
    )
    if (ok) onClose()
    else setError('保存失败，记录未更新。请检查浏览器存储权限或剩余空间。')
  }
  return (
    <Modal title="填写随访记录" subtitle={`${patient.name} · ${task.title}`} onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <div className="form-notice">
          <Info size={16} />
          当前任务：{TASK_LABELS[task.status]} · 负责人 {task.owner}
        </div>
        <label className="field">
          联系结果
          <select
            value={contact}
            onChange={(e) => {
              setContact(e.target.value)
              if (e.target.value !== '已联系') setComplete(false)
            }}
          >
            <option>已联系</option>
            <option>未接通</option>
            <option>需再次联系</option>
          </select>
        </label>
        <label className="field">
          随访记录
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            minLength={4}
            maxLength={1000}
            required
            placeholder="记录联系情况、患者反馈和已核实的信息。"
          />
        </label>
        <label className="field">
          后续安排
          <textarea
            value={action}
            onChange={(e) => setAction(e.target.value)}
            rows={2}
            minLength={2}
            maxLength={500}
            required
            placeholder="填写后续处理安排；无新增事项也请记录。"
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={complete && contact === '已联系'}
            disabled={contact !== '已联系'}
            onChange={(e) => setComplete(e.target.checked)}
          />
          本次随访已完成，结束此任务
        </label>
        {(!complete || contact !== '已联系') && (
          <label className="field">
            下一次处理日期
            <input
              aria-label="下一次处理日期"
              type="date"
              value={date}
              min={data.demoDate}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <span className="field-hint">未联系成功的任务保持进行中，并保留此次记录。</span>
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
            <Check size={16} />
            保存随访记录
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function DataModal({ onClose }: { onClose: () => void }) {
  const { data, local, exportData } = useStore()
  return (
    <Modal title="关于这份演示" subtitle="数据来源、运行方式与能力边界" onClose={onClose} wide>
      <div className="modal-body">
        <div className="data-hero">
          <span>
            <Database size={25} />
          </span>
          <div>
            <h3>本地文件驱动 · 无需数据库</h3>
            <p>12 位虚拟患者，一条完整的医护工作流程。</p>
          </div>
          <span className="demo-tag">演示环境</span>
        </div>
        <p className="body-copy">{data.description}</p>
        <div className="data-grid">
          <div>
            <FileJson size={20} />
            <strong>基础档案与分析</strong>
            <p>来自本地 dataset.json，页面不会启动 Python 模型或执行训练。</p>
          </div>
          <div>
            <ShieldCheck size={20} />
            <strong>交互记录</strong>
            <p>复核、任务与随访记录存入当前浏览器。刷新后保留，换设备不会同步。</p>
          </div>
        </div>
        <div className="evidence-box">
          <h3>模型能力与当前展示</h3>
          <table className="evidence-table">
            <thead>
              <tr>
                <th>模块</th>
                <th>当前状态</th>
                <th>展示说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>患者画像</td>
                <td>
                  <span className="neutral-pill">模拟分组</span>
                </td>
                <td>中性分析标签，不代表临床诊断</td>
              </tr>
              <tr>
                <td>再入院风险</td>
                <td>
                  <span className="neutral-pill">待重新验证</span>
                </td>
                <td>页面为模拟评分，不是个人事件概率</td>
              </tr>
              <tr>
                <td>检验趋势</td>
                <td>
                  <span className="neutral-pill">模拟观测</span>
                </td>
                <td>展示历史记录，不绘制未经验证的预测</td>
              </tr>
              <tr>
                <td>影响因素</td>
                <td>
                  <span className="neutral-pill">示意解释</span>
                </td>
                <td>非实时 SHAP 计算，不表示因果关系</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="data-checks">
          <CheckBullet>
            当前 {data.patients.length} 份档案、{local.tasks.length} 条任务，统计均由演示记录计算。
          </CheckBullet>
          <CheckBullet>演示基准日固定为 {data.demoDate}，逾期与今日任务按该日期计算。</CheckBullet>
          <CheckBullet>未接通不会被标记为已完成，所有操作均不发送外部消息。</CheckBullet>
        </div>
        <div className="modal-footer">
          <span className="footer-note">建议在重置或更换设备前导出记录。</span>
          <button className="btn" onClick={exportData}>
            <Download size={16} />
            导出演示记录
          </button>
          <button className="btn primary" onClick={onClose}>
            了解了
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function ResetModal({ onClose }: { onClose: () => void }) {
  const { reset, exportData } = useStore()
  return (
    <Modal
      title="恢复初始演示？"
      subtitle="只清除本应用保存在当前浏览器中的演示操作。"
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="reset-icon">
          <RotateCcw size={28} />
        </div>
        <p className="body-copy">
          你新增的任务、复核意见和随访记录将被移除，恢复到初始数据。项目文件及其他网站的数据不会受影响。
        </p>
        <button className="text-link inline" onClick={exportData}>
          <Download size={15} />
          先导出当前记录
        </button>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            保留当前记录
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (reset()) onClose()
            }}
          >
            确认重置
          </button>
        </div>
      </div>
    </Modal>
  )
}
