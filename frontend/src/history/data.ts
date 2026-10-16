import Papa from 'papaparse'
import { buildScoreReference } from './reference'
import type { ScoreReference } from './reference'

export interface HistoricalScore {
  id: string
  admittedAt: string
  score: number
  actual: 0 | 1
  level: string
  repetitions: number
}
export interface LabSummary {
  label: string
  last: number | null
  mean: number | null
  min: number | null
  max: number | null
  count: number | null
  slope: number | null
}
export interface HistoricalPatient {
  id: string
  sourceId: string
  age: number | null
  sex: string
  diseases: string[]
  group: string
  membership: number | null
  visits: number | null
  admissions: number | null
  diseaseScores: { disease: string; score: number }[]
  labs: LabSummary[]
  scores: HistoricalScore[]
}
export interface HistoricalDataset {
  fingerprint: string
  importedAt: string
  reference: ScoreReference
  patients: HistoricalPatient[]
  sources: { name: string; encoding: string; rows: number; columns: number }[]
  summary: {
    scoreRows: number
    scorePatients: number
    matchedPatients: number
    matchedRows: number
    matchedDistinctRows: number
    exactRepeatRows: number
    conflictingDates: number
    conflictingOutcomes: number
    dateMin: string
    dateMax: string
  }
}
type CsvRow = Record<string, string>
const MAX_FILE_BYTES = 32 * 1024 * 1024

export function numeric(value: string | undefined): number | null {
  if (value === undefined || !value.trim() || /^(nan|none|null)$/i.test(value.trim())) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
async function readCsv(file: File, required: string[]) {
  if (file.size > MAX_FILE_BYTES)
    throw new Error(`${file.name} 超过 32 MiB，请提供保留表头的关联样本。`)
  if (!file.size) throw new Error(`${file.name} 是空文件。`)
  const bytes = await file.arrayBuffer()
  let encoding = 'UTF-8'
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    encoding = 'GB18030'
    text = new TextDecoder('gb18030', { fatal: true }).decode(bytes)
  }
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),
  })
  if (parsed.errors.length)
    throw new Error(
      `${file.name} 的 CSV 结构不正确（${parsed.errors.length} 处解析问题），请核对列数和引号。`,
    )
  const fields = parsed.meta.fields ?? []
  if (new Set(fields).size !== fields.length || parsed.meta.renamedHeaders)
    throw new Error(`${file.name} 存在重复列名。`)
  const missing = required.filter((field) => !fields.includes(field))
  if (missing.length) throw new Error(`${file.name} 缺少字段：${missing.join('、')}。`)
  if (!parsed.data.length) throw new Error(`${file.name} 没有数据行。`)
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
  return { rows: parsed.data, fields, encoding, hash }
}

export function latestScores(patient: HistoricalPatient) {
  const latestDate = patient.scores[0]?.admittedAt ?? ''
  const entries = patient.scores.filter((s) => s.admittedAt === latestDate)
  return {
    date: latestDate,
    entries,
    conflicting: entries.length > 1,
    score: entries.length === 1 ? entries[0].score : null,
    level: entries.length === 1 ? entries[0].level : null,
  }
}
export function conflictDateCount(patient: HistoricalPatient) {
  const dates = new Map<string, number>()
  patient.scores.forEach((s) => dates.set(s.admittedAt, (dates.get(s.admittedAt) ?? 0) + 1))
  return [...dates.values()].filter((n) => n > 1).length
}

export async function importHistoricalFiles(
  wideFile: File,
  riskFile: File,
): Promise<HistoricalDataset> {
  const wide = await readCsv(wideFile, ['PATIENT_ID', '年龄', 'SEX'])
  const risk = await readCsv(riskFile, [
    'PATIENT_ID',
    '入院时间',
    '再入院风险评分',
    '再入院30天实际',
    '风险等级',
  ])
  const patientIds = new Set<string>()
  for (const row of wide.rows) {
    const id = row.PATIENT_ID.trim()
    if (!id) throw new Error('宽表存在空患者编号，请先核实来源。')
    if (patientIds.has(id))
      throw new Error('宽表存在重复患者编号，不能任意选取一行，请先核实关联关系。')
    patientIds.add(id)
  }
  const referenceRows: { score: number; level: string }[] = []
  const scorePatients = new Set<string>()
  const exactRows = new Set<string>()
  const matched = new Map<string, Map<string, HistoricalScore>>()
  let matchedRows = 0
  let dateMin = ''
  let dateMax = ''
  for (let i = 0; i < risk.rows.length; i++) {
    const row = risk.rows[i]
    const id = row.PATIENT_ID.trim()
    const date = row['入院时间'].trim()
    const score = numeric(row['再入院风险评分'])
    const actual = numeric(row['再入院30天实际'])
    const level = row['风险等级'].trim()
    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      !Number.isNaN(Date.parse(date)) &&
      new Date(date).toISOString().slice(0, 10) === date
    if (
      !id ||
      !validDate ||
      score === null ||
      score < 0 ||
      score > 1 ||
      (actual !== 0 && actual !== 1) ||
      !['低风险', '中风险', '高风险'].includes(level)
    ) {
      throw new Error(
        `评分表第 ${i + 2} 行的编号、日期、评分、实际标签或风险等级不合法。未丢弃或替换该记录。`,
      )
    }
    referenceRows.push({ score, level })
    scorePatients.add(id)
    const key = JSON.stringify([id, date, row['再入院风险评分'], row['再入院30天实际'], level])
    exactRows.add(key)
    if (!dateMin || date < dateMin) dateMin = date
    if (!dateMax || date > dateMax) dateMax = date
    if (!patientIds.has(id)) continue
    matchedRows++
    let scores = matched.get(id)
    if (!scores) {
      scores = new Map()
      matched.set(id, scores)
    }
    const existing = scores.get(key)
    if (existing) existing.repetitions++
    else
      scores.set(key, { id: `R${i + 1}`, admittedAt: date, score, actual, level, repetitions: 1 })
  }
  const patients = wide.rows.map((row, i): HistoricalPatient => {
    const sourceId = row.PATIENT_ID.trim()
    const age = numeric(row['年龄'])
    if (age !== null && (age < 0 || age > 130))
      throw new Error(`宽表第 ${i + 2} 行年龄超出合理范围，请核对。`)
    const diseaseScores = wide.fields
      .filter((k) => k.startsWith('风险_'))
      .flatMap((k) => {
        const score = numeric(row[k])
        if (score === null) return []
        if (score < 0 || score > 1) throw new Error(`宽表第 ${i + 2} 行的疾病评分不在 0–1 范围内。`)
        return [{ disease: k.slice(3), score }]
      })
    return {
      id: `H${String(i + 1).padStart(4, '0')}`,
      sourceId,
      age,
      sex: row.SEX.trim() === '1' ? '男' : row.SEX.trim() === '2' ? '女' : '未提供',
      diseases: wide.fields
        .filter((k) => k.startsWith('慢病_') && numeric(row[k]) === 1)
        .map((k) => k.slice(3)),
      group: row['健康画像标签']?.trim() || '未提供',
      membership: numeric(row['画像最大概率']),
      visits: numeric(row['就诊总次数']),
      admissions: numeric(row['住院次数']),
      diseaseScores,
      labs: ['血红蛋白', '白蛋白', '肌酐', '白细胞'].map((label) => ({
        label,
        last: numeric(row[`${label}_last`]),
        mean: numeric(row[`${label}_mean`]),
        min: numeric(row[`${label}_min`]),
        max: numeric(row[`${label}_max`]),
        count: numeric(row[`${label}_count`]),
        slope: numeric(row[`${label}_slope`]),
      })),
      scores: [...(matched.get(sourceId)?.values() ?? [])].sort(
        (a, b) => b.admittedAt.localeCompare(a.admittedAt) || a.id.localeCompare(b.id),
      ),
    }
  })
  let conflictingDates = 0
  let conflictingOutcomes = 0
  let matchedDistinctRows = 0
  for (const p of patients) {
    const dates = new Map<string, HistoricalScore[]>()
    for (const score of p.scores) {
      matchedDistinctRows++
      const entries = dates.get(score.admittedAt) ?? []
      entries.push(score)
      dates.set(score.admittedAt, entries)
    }
    for (const entries of dates.values()) {
      if (entries.length > 1) conflictingDates++
      if (new Set(entries.map((s) => s.actual)).size > 1) conflictingOutcomes++
    }
  }
  return {
    fingerprint: `${wide.hash}-${risk.hash}`,
    importedAt: new Date().toISOString(),
    reference: buildScoreReference(referenceRows),
    patients,
    sources: [
      {
        name: wideFile.name,
        encoding: wide.encoding,
        rows: wide.rows.length,
        columns: wide.fields.length,
      },
      {
        name: riskFile.name,
        encoding: risk.encoding,
        rows: risk.rows.length,
        columns: risk.fields.length,
      },
    ],
    summary: {
      scoreRows: risk.rows.length,
      scorePatients: scorePatients.size,
      matchedPatients: patients.filter((p) => p.scores.length).length,
      matchedRows,
      matchedDistinctRows,
      exactRepeatRows: risk.rows.length - exactRows.size,
      conflictingDates,
      conflictingOutcomes,
      dateMin,
      dateMax,
    },
  }
}
