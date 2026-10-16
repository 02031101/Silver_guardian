export type Risk = 'priority' | 'attention' | 'routine'
export type ReviewStatus = 'pending' | 'confirmed' | 'needs_info' | 'dismissed'
export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type MetricKey = 'hemoglobin' | 'albumin' | 'creatinine' | 'leukocyte'
export interface LabSeries {
  unit: string
  label: string
  reference: [number, number]
  values: number[]
}
export interface Patient {
  id: string
  name: string
  age: number
  sex: string
  avatar: string
  color: string
  diseases: string[]
  dischargeDate: string
  department: string
  owner: string
  risk: Risk
  score: number
  group: string
  completeness: number
  missing: string[]
  assessedAt: string
  reviewStatus: ReviewStatus
  factors: { name: string; detail: string; direction: 'up' | 'down'; contribution: number }[]
  labDates: string[]
  labs: Record<MetricKey, LabSeries>
  timeline: {
    date: string
    title: string
    description: string
    type: 'visit' | 'lab' | 'discharge'
  }[]
}
export interface TaskRecord {
  id: string
  at: string
  author: string
  contact: string
  note: string
  action: string
}
export interface Task {
  id: string
  patientId: string
  title: string
  dueDate: string
  owner: string
  status: TaskStatus
  source: string
  createdAt: string
  records: TaskRecord[]
}
export interface Review {
  status: ReviewStatus
  note: string
  at: string
  author: string
}
export interface AuditEvent {
  id: string
  at: string
  patientId: string
  title: string
  detail: string
}
export interface DemoData {
  version: 1
  demoDate: string
  description: string
  patients: Patient[]
  tasks: Task[]
}
export interface LocalState {
  version: 1
  reviews: Record<string, Review>
  tasks: Task[]
  events: AuditEvent[]
}
