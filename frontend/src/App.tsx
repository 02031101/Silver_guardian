import { useState } from 'react'
import { Activity, ClipboardList, ShieldCheck, ShieldPlus, Users } from 'lucide-react'
import { HistoryImportModal, HistoryWorkspace } from './history/HistoryWorkspace'
import type { HistoricalDataset } from './history/data'

export function App() {
  const [data, setData] = useState<HistoricalDataset | null>(null)
  const [replacing, setReplacing] = useState(false)
  if (data)
    return (
      <>
        <HistoryWorkspace key={data.fingerprint} data={data} onReplace={() => setReplacing(true)} />
        {replacing && (
          <HistoryImportModal
            onClose={() => setReplacing(false)}
            onImported={(next) => {
              setData(next)
              setReplacing(false)
            }}
          />
        )}
      </>
    )
  return (
    <main className="import-page">
      <header className="import-header">
        <div className="brand">
          <span className="brand-mark">
            <ShieldPlus size={29} />
          </span>
          <div>
            <strong>银龄守护</strong>
            <span>老年患者连续健康管理</span>
          </div>
        </div>
        <span className="import-header-label">历史健康档案</span>
      </header>
      <div className="import-layout">
        <section className="import-intro">
          <span className="import-kicker">
            <span />
            基于真实历史数据
          </span>
          <h1>
            导入健康数据，
            <br />
            打开患者档案。
          </h1>
          <p>
            选择已有的患者宽表与再入院评分文件，
            <br className="desktop-break" />
            统一查看健康画像、检验汇总与历史风险。
          </p>
          <div className="import-capabilities">
            {[
              { icon: Users, title: '患者档案', text: '按患者编号关联年龄、共病与画像' },
              { icon: Activity, title: '检验与风险', text: '保留原始结果，清楚呈现记录差异' },
              { icon: ClipboardList, title: '随访管理', text: '记录核对意见，跟进每一项任务' },
            ].map((item) => (
              <div key={item.title}>
                <span>
                  <item.icon size={22} />
                </span>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="import-card">
          <div className="import-card-heading">
            <h2>选择数据文件</h2>
            <p>使用现有分析结果，无需重新训练。</p>
          </div>
          <HistoryImportModal embedded onClose={() => {}} onImported={setData} />
        </section>
      </div>
      <footer className="import-footer">
        <ShieldCheck size={17} />
        文件仅在本机浏览器读取，不上传到服务器。
      </footer>
    </main>
  )
}
