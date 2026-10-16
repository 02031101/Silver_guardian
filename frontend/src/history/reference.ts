import type { HistoricalPatient, HistoricalScore } from './data'

export interface ScoreReference {
  scores: number[]
  q33: number
  q66: number
  median: number
  histogram: number[]
  levels: { label: string; count: number }[]
  labelMismatchCount: number
}

export function quantileSorted(scores: number[], fraction: number) {
  if (!scores.length) return null
  const index = (scores.length - 1) * fraction
  const lower = Math.floor(index)
  return scores[lower] + (scores[Math.ceil(index)] - scores[lower]) * (index - lower)
}

export function buildScoreReference(rows: { score: number; level: string }[]): ScoreReference {
  const scores = rows.map((row) => row.score).sort((a, b) => a - b)
  const q33 = quantileSorted(scores, 0.33) ?? 0
  const q66 = quantileSorted(scores, 0.66) ?? 0
  const histogram = Array.from({ length: 20 }, () => 0)
  const labels = new Map(['低风险', '中风险', '高风险'].map((label) => [label, 0]))
  let labelMismatchCount = 0
  // Source CSV rounds scores to four decimal places. Boundary ties must not be reclassified.
  const tolerance = 0.000051
  for (const row of rows) {
    histogram[Math.min(19, Math.floor(row.score * 20))]++
    labels.set(row.level, (labels.get(row.level) ?? 0) + 1)
    if (
      (row.level === '低风险' && row.score > q33 + tolerance) ||
      (row.level === '中风险' && (row.score < q33 - tolerance || row.score > q66 + tolerance)) ||
      (row.level === '高风险' && row.score < q66 - tolerance)
    )
      labelMismatchCount++
  }
  return {
    scores,
    q33,
    q66,
    median: quantileSorted(scores, 0.5) ?? 0,
    histogram,
    levels: [...labels].map(([label, count]) => ({ label, count })),
    labelMismatchCount,
  }
}

export function scorePercentile(score: number, reference: ScoreReference) {
  let left = 0
  let right = reference.scores.length
  while (left < right) {
    const mid = (left + right) >>> 1
    if (reference.scores[mid] < score) left = mid + 1
    else right = mid
  }
  return reference.scores.length ? (left / reference.scores.length) * 100 : null
}

export function diseaseReference(patients: HistoricalPatient[], disease: string) {
  const values = patients
    .flatMap((patient) => {
      const value = patient.diseaseScores.find((s) => s.disease === disease)?.score
      return value === undefined ? [] : [value]
    })
    .sort((a, b) => a - b)
  return { count: values.length, median: quantileSorted(values, 0.5) }
}

export function chronologicalGroups(scores: HistoricalScore[]) {
  const map = new Map<string, HistoricalScore[]>()
  for (const entry of scores) {
    const group = map.get(entry.admittedAt) ?? []
    group.push(entry)
    map.set(entry.admittedAt, group)
  }
  return [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({ date, entries }))
}
