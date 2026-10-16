import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowDownToLine,
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Database,
  Heart,
  LayoutDashboard,
  Menu,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldPlus,
  Users,
  AlertCircle,
} from 'lucide-react'
import { Dashboard, Followups, PatientDetail, Patients, Reviews } from './pages'
import { CreateTaskModal, DataModal, ResetModal } from './forms'
import { Empty } from './components'
import { useStore } from './store'

const navigation = [
  { to: '/', label: '工作台', en: 'Overview', icon: LayoutDashboard },
  { to: '/patients', label: '患者档案', en: 'Patients', icon: Users },
  { to: '/reviews', label: '风险复核', en: 'Risk review', icon: ShieldCheck },
  { to: '/followups', label: '随访任务', en: 'Follow-ups', icon: ClipboardList },
]

export function App() {
  const { data, local, toast, exportData } = useStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [info, setInfo] = useState(false)
  const [reset, setReset] = useState(false)
  const [create, setCreate] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [query, setQuery] = useState('')
  const search = useRef<HTMLInputElement>(null)
  const main = useRef<HTMLElement>(null)
  const pending = data.patients.filter((p) => local.reviews[p.id].status === 'pending').length
  const page =
    location.pathname === '/'
      ? '工作台'
      : location.pathname.startsWith('/patients/')
        ? '患者健康档案'
        : (navigation.find((n) => n.to !== '/' && location.pathname.startsWith(n.to))?.label ??
          '页面')
  useEffect(() => {
    setMobileMenu(false)
    main.current?.scrollTo({ top: 0 })
    document.title = `${page} · 银龄守护`
  }, [location.pathname, page])
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (
        e.key === '/' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) &&
        !document.querySelector('dialog[open]')
      ) {
        e.preventDefault()
        search.current?.focus()
      }
      if (e.key === 'Escape') setMobileMenu(false)
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [])
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault()
          main.current?.focus()
          main.current?.scrollIntoView()
        }}
      >
        跳到主要内容
      </a>
      {mobileMenu && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileMenu(false)}
          aria-label="关闭导航"
        />
      )}
      <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
        <Link to="/" className="brand">
          <span className="brand-mark">
            <ShieldPlus size={27} strokeWidth={1.7} />
          </span>
          <div>
            <strong>银龄守护</strong>
            <span>SILVER GUARDIAN</span>
          </div>
        </Link>
        <div className="workspace-label">智慧医疗 · 连续健康管理</div>
        <div className="nav-group-label">
          医护工作空间<span>WORKSPACE</span>
        </div>
        <nav aria-label="主要导航">
          {navigation.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <n.icon size={20} strokeWidth={1.7} />
              <span>{n.label}</span>
              {n.to === '/reviews' && pending > 0 && <small className="nav-count">{pending}</small>}
              {n.to === '/' && <span className="nav-active-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-care-card">
            <span>
              <Heart size={18} />
            </span>
            <h3>
              有温度的医疗，
              <br />
              有连续的关怀。
            </h3>
            <p>连接出院评估与每一次随访。</p>
            <div>
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <button className="sidebar-help" onClick={() => setInfo(true)}>
            <CircleHelp size={18} />
            <span>演示说明与数据来源</span>
            <ChevronRight size={15} />
          </button>
          <div className="local-environment">
            <span className="small-green-dot" />
            <span>本地演示环境</span>
            <span>v1.0</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-menu-button"
              onClick={() => setMobileMenu((v) => !v)}
              aria-label="打开导航"
              aria-expanded={mobileMenu}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-root">医护工作空间</span>
            <ChevronRight size={13} />
            <span className="breadcrumb-current">{page}</span>
          </div>
          <div className="topbar-right">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault()
                navigate(`/patients${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
                setQuery('')
                search.current?.blur()
              }}
            >
              <Search size={16} />
              <input
                ref={search}
                aria-label="全局搜索患者"
                placeholder="搜索患者"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>/</kbd>
            </form>
            <button
              className="notification-button icon-btn"
              aria-label={`查看${pending}项待复核评估`}
              onClick={() => navigate('/reviews')}
            >
              <Bell size={19} />
              {pending > 0 && <span />}
            </button>
            <div className="user-identity">
              <span className="doctor-avatar">陈</span>
              <div>
                <strong>陈医生</strong>
                <span>演示医护身份</span>
              </div>
            </div>
          </div>
        </header>
        <main className="main-content" id="main-content" ref={main} tabIndex={-1}>
          <div className="content-wrap">
            <div className="demo-banner">
              <div>
                <span className="demo-badge">
                  <span />
                  DEMO
                </span>
                <span>当前为演示环境，所有患者与分析结果均为模拟数据。</span>
                <button onClick={() => setInfo(true)}>
                  了解数据来源
                  <ChevronRight size={13} />
                </button>
              </div>
              <div className="demo-actions">
                <button onClick={exportData} title="导出演示记录" aria-label="导出演示记录">
                  <ArrowDownToLine size={14} />
                  <span>导出记录</span>
                </button>
                <span />
                <button onClick={() => setReset(true)} title="重置演示">
                  <RotateCcw size={13} />
                  <span>重置演示</span>
                </button>
              </div>
            </div>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/patients" element={<Patients />} />
              <Route path="/patients/:id" element={<PatientDetail />} />
              <Route path="/reviews" element={<Reviews />} />
              <Route path="/followups" element={<Followups />} />
              <Route
                path="*"
                element={
                  <Empty
                    title="这个页面不存在"
                    description="返回工作台继续查看患者与任务。"
                    action={
                      <Link className="btn primary" to="/">
                        返回工作台
                      </Link>
                    }
                  />
                }
              />
            </Routes>
            <footer className="app-footer">
              <span>
                <ShieldPlus size={13} />
                银龄守护<span>·</span>让每一次关注，都有后续。
              </span>
              <button onClick={() => setInfo(true)}>
                <Database size={13} />
                本地 JSON + 浏览器存储
                <ChevronRight size={12} />
              </button>
            </footer>
          </div>
        </main>
        <button
          className="floating-create"
          aria-label="快速新建随访任务"
          onClick={() => setCreate(true)}
        >
          <Plus size={20} />
          <span>新建随访</span>
        </button>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          {toast.message}
        </div>
      )}
      {info && <DataModal onClose={() => setInfo(false)} />}
      {reset && <ResetModal onClose={() => setReset(false)} />}
      {create && <CreateTaskModal onClose={() => setCreate(false)} />}
    </div>
  )
}
