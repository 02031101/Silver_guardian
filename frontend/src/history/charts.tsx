import { useState } from 'react'
import { PanelTitle } from '../components'
import { latestScores } from './data'
import type { HistoricalPatient, HistoricalScore, LabSummary } from './data'
import { chronologicalGroups, diseaseReference, scorePercentile } from './reference'
import type { ScoreReference } from './reference'
import './charts.css'

const number = (n: number) => n.toLocaleString('zh-CN')
const value = (n: number) => Number(n.toFixed(4)).toString()
const gradeClass = (label: string) =>
  label === '高风险' ? 'high' : label === '中风险' ? 'medium' : 'low'

export function ReferenceRules({ reference: r }: { reference: ScoreReference }) {
  return (
    <div className="reference-rules">
      <div className="reference-bands">
        <div>
          <i className="legend-dot low" />
          <strong>低风险组</strong>
          <span>约 ≤ {value(r.q33)}</span>
        </div>
        <div>
          <i className="legend-dot medium" />
          <strong>中风险组</strong>
          <span>
            约 {value(r.q33)}–{value(r.q66)}
          </span>
        </div>
        <div>
          <i className="legend-dot high" />
          <strong>高风险组</strong>
          <span>约 &gt; {value(r.q66)}</span>
        </div>
      </div>
      <p>
        原模型按评分的第 33、66
        百分位分组；以上界限由当前评分文件重算，仅作近似参照。边界同分受导出精度影响，等级保留原表值。
      </p>
      {r.labelMismatchCount > 0 && (
        <p className="reference-warning">
          有 {number(r.labelMismatchCount)}{' '}
          行原等级与本文件分位界限不一致，文件可能是部分样本。请以原等级及原始建模记录核对，不按此参照改写等级。
        </p>
      )}
    </div>
  )
}

export function ScoreDistribution({ reference: r }: { reference: ScoreReference }) {
  const [selected, setSelected] = useState<number | null>(null)
  const maximum = Math.max(...r.histogram, 1)
  return (
    <div className="score-overview-charts">
      <section className="panel">
        <PanelTitle title="再入院评分分布" subtitle="当前评分文件 · 每格宽度 0.05" />
        <div className="chart-content">
          <div className="chart-kicker">
            <strong>{number(r.scores.length)} 条</strong>
            <span>评分记录 · 含原表重复行</span>
          </div>
          <div className="histogram-layout">
            <div className="histogram-y">
              <span>{number(maximum)}</span>
              <span>记录数</span>
              <span>0</span>
            </div>
            <div className="histogram-plot">
              <div className="histogram-bars" aria-label="再入院评分分布直方图">
                {r.histogram.map((count, i) => (
                  <button
                    key={i}
                    type="button"
                    className="histogram-bar low"
                    aria-label={`评分 ${value(i / 20)} 至 ${value((i + 1) / 20)}${i === 19 ? '，含 1' : '，不含上界'}：${number(count)} 条`}
                    aria-pressed={selected === i}
                    onFocus={() => setSelected(i)}
                    onMouseEnter={() => setSelected(i)}
                    onClick={() => setSelected(i)}
                    style={{ height: `${(count / maximum) * 100}%` }}
                  />
                ))}
              </div>
              <span
                className="histogram-guide"
                style={{ left: `${r.q33 * 100}%` }}
                aria-hidden="true"
              />
              <span
                className="histogram-guide"
                style={{ left: `${r.q66 * 100}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="histogram-x">
            <span>0</span>
            <span>0.25</span>
            <span>0.5</span>
            <span>0.75</span>
            <span>1</span>
          </div>
          <p className="chart-selection" aria-live="polite">
            {selected === null
              ? '点击柱形查看区间记录数；虚线为第 33、66 百分位。'
              : `区间 ${value(selected / 20)}–${value((selected + 1) / 20)}${selected === 19 ? '（含上界）' : '（不含上界）'}：${number(r.histogram[selected])} 条，占 ${((r.histogram[selected] / r.scores.length) * 100).toFixed(1)}%。`}
          </p>
          <p className="chart-caption">
            参照包含评分文件内全部记录，也包含未关联到宽表的患者；这是记录分布，不能作为患者患病率。
          </p>
        </div>
      </section>
      <section className="panel">
        <PanelTitle title="评分等级与分组参照" subtitle="原表等级 · 相对分组" />
        <div className="chart-content">
          <div className="level-bars">
            {r.levels.map((level) => (
              <div className="level-row" key={level.label}>
                <div>
                  <strong>{level.label}</strong>
                  <span>
                    {number(level.count)} 条 · {((level.count / r.scores.length) * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="level-track">
                  <span
                    className={gradeClass(level.label)}
                    style={{ width: `${(level.count / r.scores.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <ReferenceRules reference={r} />
          <p className="chart-caption">
            评分范围
            0–1，越高表示模型给出的再入院倾向越高。“低风险”只是相对分组，不等于没有风险；评分尚不能直接解释为个人事件概率。
          </p>
        </div>
      </section>
    </div>
  )
}

export function IndividualReference({
  patient,
  reference: r,
}: {
  patient: HistoricalPatient
  reference: ScoreReference
}) {
  const latest = latestScores(patient)
  const percentile = latest.score === null ? null : scorePercentile(latest.score, r)
  return (
    <div className="individual-reference">
      <div className="score-scale" aria-label="0 至 1 评分刻度与分位参照">
        <div className="score-scale-track">
          <span className="low" style={{ width: `${r.q33 * 100}%` }} />
          <span className="medium" style={{ width: `${(r.q66 - r.q33) * 100}%` }} />
          <span className="high" style={{ width: `${(1 - r.q66) * 100}%` }} />
        </div>
        {latest.entries.map((s) => (
          <span
            key={s.id}
            className="score-scale-marker"
            style={{ left: `${s.score * 100}%` }}
            title={`${s.score} · ${s.level}`}
          />
        ))}
      </div>
      <div className="scale-endpoints">
        <span>0 · 评分较低</span>
        <span>1 · 评分较高</span>
      </div>
      {percentile !== null && (
        <p className="percentile-explanation">
          高于本文件 <strong>{percentile.toFixed(1)}%</strong> 的评分记录
          <span>参照 {number(r.scores.length)} 条原始记录，含重复行；同分不计入“高于”。</span>
        </p>
      )}
      {latest.conflicting && (
        <p className="chart-caption">刻度标记保留同日所有不同结果；未计算单一分位位置。</p>
      )}
      <ReferenceRules reference={r} />
      <p className="chart-caption">
        这是历史模型的再入院倾向评分，尚不能把{' '}
        {latest.score === null ? '评分' : value(latest.score)} 直接当作
        {latest.score === null
          ? '个人再入院概率'
          : `${(latest.score * 100).toFixed(1)}% 的个人再入院概率`}
        。“低风险”不等于没有风险。
      </p>
    </div>
  )
}

export function LabRanges({ labs }: { labs: LabSummary[] }) {
  return (
    <div className="lab-ranges">
      <div className="chart-legend">
        <span>
          <i className="mean-symbol" />
          均值
        </span>
        <span>
          <i className="last-symbol" />
          末次值
        </span>
        <span>横线：本人历史最小–最大值</span>
      </div>
      {labs.map((lab) => {
        const valid = lab.min !== null && lab.max !== null && lab.min <= lab.max
        const min = lab.min ?? 0,
          max = lab.max ?? 0
        const position = (n: number) => (max === min ? 50 : ((n - min) / (max - min)) * 100)
        const inRange = (n: number | null): n is number => n !== null && n >= min && n <= max
        return (
          <div className="lab-range-row" key={lab.label}>
            <div className="lab-range-heading">
              <strong>{lab.label}</strong>
              <span>末次 {lab.last === null ? '未提供' : value(lab.last)}</span>
            </div>
            {valid ? (
              <>
                <div className={`lab-range-track${min === max ? ' single-value' : ''}`}>
                  {inRange(lab.mean) && (
                    <i className="mean-symbol" style={{ left: `${position(lab.mean)}%` }} />
                  )}
                  {inRange(lab.last) && (
                    <i className="last-symbol" style={{ left: `${position(lab.last)}%` }} />
                  )}
                </div>
                <div className="scale-endpoints">
                  <span>最小 {value(min)}</span>
                  <span>最大 {value(max)}</span>
                </div>
                {((!inRange(lab.mean) && lab.mean !== null) ||
                  (!inRange(lab.last) && lab.last !== null)) && (
                  <p className="reference-warning">均值或末次值超出原表范围，请核对源数据。</p>
                )}
              </>
            ) : (
              <p className="chart-caption">范围缺失或不一致，未绘制范围线。</p>
            )}
            <p className="lab-range-detail">
              均值 {lab.mean === null ? '未提供' : value(lab.mean)} · 记录数{' '}
              {lab.count === null ? '未提供' : number(lab.count)}
            </p>
          </div>
        )
      })}
      <p className="chart-caption">
        各指标单独按本人的历史范围绘制，不同指标的横向位置不可直接比较。原表未提供日期、单位与正常参考区间，不能据此判定正常或异常。
      </p>
    </div>
  )
}

export function DiseaseComparison({
  patient,
  patients,
}: {
  patient: HistoricalPatient
  patients: HistoricalPatient[]
}) {
  return (
    <>
      <div className="chart-content disease-intro">
        <p className="chart-caption">
          这些是共病识别模型的原始输出，分数越高表示模型越倾向识别出该病，不代表未来发病率。每条按
          0–1 刻度展示；竖线为当前宽表中同一疾病评分的中位数，不是诊断阈值。
        </p>
        <div className="chart-legend">
          <span>
            <i className="legend-dot low" />
            本人评分
          </span>
          <span>
            <i className="median-symbol" />
            样本中位数
          </span>
        </div>
      </div>
      <div className="disease-comparison">
        {patient.diseaseScores.length ? (
          patient.diseaseScores.map((s) => {
            const peer = diseaseReference(patients, s.disease)
            return (
              <div className="disease-row" key={s.disease}>
                <div className="disease-row-heading">
                  <strong>{s.disease}</strong>
                  <span>{value(s.score)}</span>
                </div>
                <div
                  className="disease-track"
                  aria-label={`${s.disease} 本人 ${value(s.score)}，样本中位数 ${peer.median === null ? '未提供' : value(peer.median)}`}
                >
                  <span style={{ width: `${s.score * 100}%` }} />
                  {peer.median !== null && (
                    <i className="median-symbol" style={{ left: `${peer.median * 100}%` }} />
                  )}
                </div>
                <div className="scale-endpoints">
                  <span>0</span>
                  <span>1</span>
                </div>
                <p>
                  中位数 {peer.median === null ? '未提供' : value(peer.median)} · 有效样本{' '}
                  {number(peer.count)} 人
                </p>
              </div>
            )
          })
        ) : (
          <p className="body-copy">原表未提供疾病评分。</p>
        )}
      </div>
    </>
  )
}

export function ReadmissionTimeline({
  scores,
  reference: r,
}: {
  scores: HistoricalScore[]
  reference: ScoreReference
}) {
  const groups = chronologicalGroups(scores)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  if (!groups.length) return null
  const selected = scores.find((s) => s.id === selectedId) ?? groups[groups.length - 1].entries[0]
  const start = Date.parse(`${groups[0].date}T00:00:00Z`)
  const end = Date.parse(`${groups[groups.length - 1].date}T00:00:00Z`)
  const x = (date: string) =>
    start === end ? 50 : 4 + ((Date.parse(`${date}T00:00:00Z`) - start) / (end - start)) * 92
  const y = (score: number) => 22 + (1 - score) * 210
  return (
    <section className="panel history-section">
      <PanelTitle title="历史再入院评分变化" subtitle="按原表入院日期排列 · 纵轴固定 0–1" />
      <div className="chart-content">
        <div className="timeline-scroll">
          <div className="timeline-chart">
            <div className="timeline-y">
              {[1, 0.75, 0.5, 0.25, 0].map((n) => (
                <span key={n} style={{ top: y(n) }}>
                  {n}
                </span>
              ))}
            </div>
            <div className="timeline-plot">
              <svg width="100%" height="252" aria-label="历史再入院评分变化图">
                {[0, 0.25, 0.5, 0.75, 1].map((n) => (
                  <line key={n} x1="0" x2="100%" y1={y(n)} y2={y(n)} className="timeline-grid" />
                ))}
                {[r.q33, r.q66].map((n, i) => (
                  <line
                    key={i}
                    x1="0"
                    x2="100%"
                    y1={y(n)}
                    y2={y(n)}
                    className="timeline-reference"
                  />
                ))}
                {groups
                  .slice(1)
                  .map((group, i) =>
                    group.entries.length === 1 && groups[i].entries.length === 1 ? (
                      <line
                        key={group.date}
                        x1={`${x(groups[i].date)}%`}
                        x2={`${x(group.date)}%`}
                        y1={y(groups[i].entries[0].score)}
                        y2={y(group.entries[0].score)}
                        className="timeline-connection"
                      />
                    ) : null,
                  )}
                {groups.flatMap((group) =>
                  group.entries.map((s) => (
                    <circle
                      key={s.id}
                      cx={`${x(group.date)}%`}
                      cy={y(s.score)}
                      r={selected.id === s.id ? 8 : 6}
                      className={`timeline-point ${gradeClass(s.level)}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${s.admittedAt}，评分 ${value(s.score)}，${s.level}，原表出现 ${s.repetitions} 次`}
                      onFocus={() => setSelectedId(s.id)}
                      onClick={() => setSelectedId(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedId(s.id)
                        }
                      }}
                    >
                      <title>
                        {s.admittedAt} · {value(s.score)} · {s.level}
                      </title>
                    </circle>
                  )),
                )}
              </svg>
              <div className="timeline-x">
                <span>{groups[0].date}</span>
                <span>入院日期</span>
                <span>{groups[groups.length - 1].date}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="timeline-selected" aria-live="polite">
          <strong>{selected.admittedAt}</strong>
          <span>
            评分 {value(selected.score)} · {selected.level}
          </span>
          <span>
            30 天实际标签 {selected.actual} · 原表出现 {selected.repetitions} 次
          </span>
        </div>
        <p className="chart-caption">
          点击或键盘选择圆点查看记录；虚线为当前文件第 33、66
          百分位。同日不同结果分别绘点并断开连线，同分圆点可能重叠，完整记录见下表。连线只连接相邻的唯一结果，不代表两次入院之间的实际变化，也不代表治疗效果。
        </p>
      </div>
    </section>
  )
}
