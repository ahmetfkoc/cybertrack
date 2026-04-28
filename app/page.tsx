'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

// ─── types ────────────────────────────────────────────────────────────────────

type ColorKey = 'amber' | 'teal' | 'blue' | 'gray' | 'purple'
type Status    = 'pending' | 'in_progress' | 'done'
type View      = 'empty' | 'onboarding' | 'dashboard' | 'goals' | 'ai'

interface Category {
  id:    string
  name:  string
  color: ColorKey
}

interface Goal {
  id:          string
  title:       string
  categoryId:  string
  status:      Status
  weekStart:   string
  completedAt: string | null
  createdAt:   string
}

interface ChatMessage {
  role:    'user' | 'assistant'
  content: string
}

interface Profile {
  focusArea:  string
  bigGoal:    string
  timeline:   string
  challenge:  string
}

interface UserStore {
  onboarded:   boolean
  profile:     Profile | null
  summary:     string
  categories:  Category[]
  goals:       Goal[]
  streak:      number
  chatHistory: ChatMessage[]
}

// ─── design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:       '#F7F6F3',
  card:     '#FFFFFF',
  border:   'rgba(0,0,0,0.08)',
  charcoal: '#2C2C2A',
  muted:    '#8A8A85',
  muted2:   '#BDBDB8',
  pill:     '#F1EFE8',
}

const COLORS: Record<ColorKey, { text: string; bg: string }> = {
  amber:  { text: '#BA7517', bg: '#FAEEDA' },
  teal:   { text: '#0F6E56', bg: '#E1F5EE' },
  blue:   { text: '#185FA5', bg: '#E6F1FB' },
  gray:   { text: '#5F5E5A', bg: '#F1EFE8' },
  purple: { text: '#6B3FA0', bg: '#F0E8FA' },
}

const card: React.CSSProperties = {
  background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 12, padding: 16,
}

// ─── storage ──────────────────────────────────────────────────────────────────

const STORE_KEY = 'cybertrack_user'

const EMPTY_STORE: UserStore = {
  onboarded: false, profile: null, summary: '',
  categories: [], goals: [], streak: 0, chatHistory: [],
}

function loadStore(): UserStore {
  if (typeof window === 'undefined') return EMPTY_STORE
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? { ...EMPTY_STORE, ...JSON.parse(raw) } : EMPTY_STORE
  } catch { return EMPTY_STORE }
}

function saveStore(s: UserStore) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch {}
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function getMonday(d = new Date()): string {
  const day  = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const m    = new Date(d)
  m.setDate(diff)
  return m.toISOString().split('T')[0]
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function weekNumber() {
  const now   = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
}

function checkWeekRollover(store: UserStore): UserStore {
  const todayMonday  = getMonday()
  const lastWeekStart = store.goals.find(g => g.weekStart)?.weekStart ?? todayMonday
  if (todayMonday === lastWeekStart) return store

  const lastWeekDone = store.goals.filter(g => g.weekStart === lastWeekStart && g.status === 'done').length
  const newStreak    = lastWeekDone > 0 ? store.streak + 1 : 0
  const updatedGoals = store.goals.map(g =>
    g.weekStart === lastWeekStart && g.status !== 'done'
      ? { ...g, weekStart: todayMonday, status: 'pending' as Status }
      : g
  )
  return { ...store, goals: updatedGoals, streak: newStreak }
}

// ─── small primitives ─────────────────────────────────────────────────────────

function Dot({ color }: { color: string }) {
  return <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
}

function CPill({ label, color }: { label: string; color: ColorKey }) {
  const c = COLORS[color]
  return (
    <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: c.bg, color: c.text, fontWeight: 500, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function SectionHdr({ left, right, onRight }: { left: string; right?: string; onRight?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: T.charcoal }}>{left}</span>
      {right && <button onClick={onRight} style={{ fontSize: 12, color: T.muted, background: 'none', border: 'none', cursor: 'pointer' }}>{right}</button>}
    </div>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{
      width: 18, height: 18, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
      border:      checked ? 'none' : `1.5px solid ${T.muted2}`,
      background:  checked ? T.charcoal : 'transparent',
      display:     'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.8 7L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}

// ─── goal row ─────────────────────────────────────────────────────────────────

function GoalRow({ goal, cat, onToggle, onDelete, isLast }: {
  goal:     Goal
  cat:      Category | undefined
  onToggle: () => void
  onDelete: () => void
  isLast:   boolean
}) {
  const done = goal.status === 'done'
  const [hover, setHover] = useState(false)

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
        borderBottom: isLast ? 'none' : `0.5px solid ${T.border}`,
      }}>
      <Checkbox checked={done} onChange={onToggle} />
      <span style={{
        flex: 1, fontSize: 13, lineHeight: 1.45,
        color:          done ? T.muted2 : T.charcoal,
        textDecoration: done ? 'line-through' : 'none',
      }}>
        {goal.title}
      </span>
      {cat && <CPill label={cat.name} color={cat.color} />}
      <button
        onClick={onDelete}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 16, lineHeight: 1, color: T.muted2,
          opacity:    hover ? 1 : 0, transition: 'opacity 0.15s', padding: '0 2px',
        }}>
        ×
      </button>
    </div>
  )
}

// ─── sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ view, setView, streak, onReset }: {
  view:    View
  setView: (v: View) => void
  streak:  number
  onReset: () => void
}) {
  const navItem = (id: View, icon: React.ReactNode, label: string) => {
    const active = view === id
    return (
      <button key={id} onClick={() => setView(id)} style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
        padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
        background: active ? T.pill : 'transparent',
        color:      active ? T.charcoal : T.muted,
        fontWeight: active ? 500 : 400, fontSize: 13, textAlign: 'left',
      }}>
        <span style={{ opacity: active ? 1 : 0.5, display: 'flex' }}>{icon}</span>
        {label}
      </button>
    )
  }

  return (
    <aside style={{
      width: 200, flexShrink: 0, height: '100vh', position: 'fixed', top: 0, left: 0,
      background: T.card, borderRight: `0.5px solid ${T.border}`,
      display: 'flex', flexDirection: 'column', padding: '0 12px',
    }}>
      {/* logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '20px 8px 16px' }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: T.charcoal, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 500, color: T.charcoal }}>CyberTrack</span>
      </div>

      <nav style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 500, color: T.muted2, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '12px 10px 6px' }}>Workspace</div>
        {navItem('dashboard', <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="0" y="0" width="6" height="6" rx="1.5"/><rect x="8" y="0" width="6" height="6" rx="1.5"/><rect x="0" y="8" width="6" height="6" rx="1.5"/><rect x="8" y="8" width="6" height="6" rx="1.5"/></svg>, 'Dashboard')}
        {navItem('goals', <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="4" x2="12" y2="4"/><line x1="2" y1="7" x2="12" y2="7"/><line x1="2" y1="10" x2="9" y2="10"/></svg>, 'All goals')}
        <div style={{ fontSize: 10, fontWeight: 500, color: T.muted2, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '12px 10px 6px' }}>Tools</div>
        {navItem('ai', <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5.5"/><line x1="7" y1="4" x2="7" y2="7"/><line x1="7" y1="7" x2="9.5" y2="9.5"/></svg>, 'AI mentor')}
      </nav>

      {/* bottom */}
      <div style={{ paddingBottom: 16 }}>
        <div style={{ background: T.pill, borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: T.charcoal }}>Week {weekNumber()}</div>
          <div style={{ fontSize: 11, color: T.muted }}>🔥 {streak} week streak</div>
        </div>
        <button onClick={onReset} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: T.muted2, padding: '4px 10px' }}>
          Reset &amp; restart
        </button>
      </div>
    </aside>
  )
}

// ─── empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onStart }: { onStart: () => void }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 50) }, [])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: T.bg,
      opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity 0.4s ease, transform 0.4s ease',
    }}>
      <div style={{ ...card, maxWidth: 440, width: '100%', margin: '0 24px', padding: 40, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: T.charcoal, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 500, color: T.charcoal, marginBottom: 10 }}>Let's build your goal plan</h1>
        <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.65, marginBottom: 28 }}>
          Answer a few questions and your AI mentor will help you set up your first goals and categories.
        </p>
        <button onClick={onStart} style={{
          width: '100%', padding: '12px 0', borderRadius: 10, border: 'none',
          background: T.charcoal, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer',
        }}>
          Get started with AI
        </button>
      </div>
    </div>
  )
}

// ─── onboarding flow ──────────────────────────────────────────────────────────

const OB_STEPS = [
  {
    q:    'What area of your life are you focused on right now?',
    key:  'focusArea',
    type: 'options' as const,
    opts: ['Career & job hunting', 'Learning & certifications', 'Freelance & side projects', 'Health & fitness', 'Personal development', 'Creative projects', 'Mix of several'],
  },
  {
    q:           'What\'s your biggest goal right now? Be as specific as you can.',
    key:         'bigGoal',
    type:        'text' as const,
    placeholder: 'e.g. Land a software engineering job by August',
  },
  {
    q:    'When do you want to achieve it?',
    key:  'timeline',
    type: 'options' as const,
    opts: ['Within 1 month', '1–3 months', '3–6 months', '6–12 months', 'No specific deadline'],
  },
  {
    q:    'What\'s your biggest challenge when it comes to staying on track?',
    key:  'challenge',
    type: 'options' as const,
    opts: ['Staying consistent', 'Not sure where to start', 'Too many things at once', 'Lack of motivation', 'Managing my time'],
  },
]

function Onboarding({ onComplete }: { onComplete: (store: Partial<UserStore>) => void }) {
  const [step,    setStep]    = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [custom,  setCustom]  = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [visible, setVisible] = useState(true)

  const current = OB_STEPS[step]

  const pick = (val: string) => {
    const next = { ...answers, [current.key]: val }
    setAnswers(next)
    // animate out then in
    setVisible(false)
    setTimeout(() => {
      if (step < OB_STEPS.length - 1) {
        setStep(s => s + 1)
        setCustom('')
        setVisible(true)
      } else {
        setVisible(true)
        submit(next)
      }
    }, 220)
  }

  const submitText = () => {
    const val = custom.trim()
    if (!val) return
    pick(val)
  }

  const submit = async (finalAnswers: Record<string, string>) => {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'onboarding', profile: finalAnswers }),
      })
      const { reply } = await res.json()

      // strip markdown fences if present
      const cleaned = reply.replace(/```json|```/g, '').trim()
      let data: { categories: { name: string; color: ColorKey; goals: { text: string; dueDay: string }[] }[]; summary: string }
      try {
        data = JSON.parse(cleaned)
      } catch {
        setError('Something went wrong building your plan. Please try again.')
        setLoading(false)
        return
      }

      const monday = getMonday()
      const categories: Category[] = data.categories.map(c => ({
        id: uid(), name: c.name, color: c.color in COLORS ? c.color : 'blue',
      }))

      const goals: Goal[] = []
      data.categories.forEach((c, ci) => {
        const catId = categories[ci].id
        c.goals.forEach(g => {
          goals.push({ id: uid(), title: g.text, categoryId: catId, status: 'pending', weekStart: monday, completedAt: null, createdAt: new Date().toISOString() })
        })
      })

      onComplete({
        onboarded:  true,
        profile:    finalAnswers as unknown as Profile,
        summary:    data.summary ?? '',
        categories,
        goals,
      })
    } catch {
      setError('Network error. Please check your connection and try again.')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: T.bg }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: T.charcoal, marginBottom: 8 }}>Your AI mentor is building your plan…</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: '50%', background: T.charcoal,
                animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }} />
            ))}
          </div>
          {error && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, color: '#BA7517', marginBottom: 12 }}>{error}</div>
              <button onClick={() => submit(answers)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: T.charcoal, color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                Try again
              </button>
            </div>
          )}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: T.bg, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* progress dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 32 }}>
          {OB_STEPS.map((_, i) => (
            <div key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 99, background: i <= step ? T.charcoal : T.muted2, transition: 'all 0.3s ease' }} />
          ))}
        </div>

        <div style={{
          opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.22s ease, transform 0.22s ease',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: T.charcoal, marginBottom: 24, lineHeight: 1.4 }}>
            {current.q}
          </h2>

          {current.type === 'options' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {current.opts.map(opt => (
                <button key={opt} onClick={() => pick(opt)} style={{
                  padding: '12px 16px', borderRadius: 10, border: `0.5px solid ${T.border}`,
                  background: T.card, color: T.charcoal, fontSize: 13, fontWeight: 400,
                  textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.charcoal; (e.currentTarget as HTMLButtonElement).style.background = T.pill }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = T.border; (e.currentTarget as HTMLButtonElement).style.background = T.card }}>
                  {opt}
                </button>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input value={custom} onChange={e => setCustom(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && custom.trim() && pick(custom.trim())}
                  placeholder="Or type your own…"
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: `0.5px solid ${T.border}`, background: T.card, fontSize: 13, color: T.charcoal, outline: 'none' }} />
                {custom.trim() && (
                  <button onClick={() => pick(custom.trim())} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: T.charcoal, color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                    Next
                  </button>
                )}
              </div>
            </div>
          )}

          {current.type === 'text' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <textarea value={custom} onChange={e => setCustom(e.target.value)}
                placeholder={(current as { placeholder?: string }).placeholder ?? ''}
                rows={3}
                style={{ padding: '12px 14px', borderRadius: 10, border: `0.5px solid ${T.border}`, background: T.card, fontSize: 13, color: T.charcoal, outline: 'none', resize: 'none', lineHeight: 1.6 }} />
              <button onClick={submitText} disabled={!custom.trim()} style={{
                padding: '12px 0', borderRadius: 10, border: 'none',
                background: custom.trim() ? T.charcoal : T.muted2,
                color: '#fff', fontSize: 13, fontWeight: 500,
                cursor: custom.trim() ? 'pointer' : 'default',
              }}>Continue</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── add goal modal ───────────────────────────────────────────────────────────

function AddGoalModal({ categories, onClose, onSave }: {
  categories: Category[]
  onClose:    () => void
  onSave:     (title: string, catId: string) => void
}) {
  const [title,  setTitle]  = useState('')
  const [catId,  setCatId]  = useState(categories[0]?.id ?? '')

  const save = () => {
    if (!title.trim() || !catId) return
    onSave(title.trim(), catId)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(44,44,42,0.35)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...card, width: '100%', maxWidth: 440, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>New goal</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.muted }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: T.muted, display: 'block', marginBottom: 5 }}>Goal</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="What do you want to accomplish this week?"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `0.5px solid ${T.border}`, background: T.bg, fontSize: 13, color: T.charcoal, outline: 'none' }} />
          </div>
          {categories.length > 0 && (
            <div>
              <label style={{ fontSize: 11, color: T.muted, display: 'block', marginBottom: 8 }}>Category</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {categories.map(c => {
                  const col = COLORS[c.color]
                  return (
                    <button key={c.id} onClick={() => setCatId(c.id)} style={{
                      padding: '5px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                      background: catId === c.id ? col.bg : T.bg,
                      color:      catId === c.id ? col.text : T.muted,
                      border:     `0.5px solid ${catId === c.id ? col.text + '50' : T.border}`,
                      fontWeight: catId === c.id ? 500 : 400,
                    }}>{c.name}</button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `0.5px solid ${T.border}`, background: T.bg, color: T.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={!title.trim()} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: title.trim() ? T.charcoal : T.muted2, color: '#fff', fontSize: 13, fontWeight: 500, cursor: title.trim() ? 'pointer' : 'default' }}>
            Add goal
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── add category modal ───────────────────────────────────────────────────────

function AddCatModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string, color: ColorKey) => void }) {
  const [name,  setName]  = useState('')
  const [color, setColor] = useState<ColorKey>('blue')
  const colors = Object.keys(COLORS) as ColorKey[]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(44,44,42,0.35)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ ...card, width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>New category</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: T.muted }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: T.muted, display: 'block', marginBottom: 5 }}>Name</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && name.trim() && onSave(name.trim(), color)}
              placeholder="e.g. Interview Prep, AWS Study, Side Project"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `0.5px solid ${T.border}`, background: T.bg, fontSize: 13, color: T.charcoal, outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: T.muted, display: 'block', marginBottom: 8 }}>Color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {colors.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{
                  width: 28, height: 28, borderRadius: '50%', cursor: 'pointer',
                  background: COLORS[c].bg, border: color === c ? `2px solid ${COLORS[c].text}` : `1px solid ${COLORS[c].text}40`,
                }} />
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `0.5px solid ${T.border}`, background: T.bg, color: T.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => name.trim() && onSave(name.trim(), color)} disabled={!name.trim()} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: name.trim() ? T.charcoal : T.muted2, color: '#fff', fontSize: 13, fontWeight: 500, cursor: name.trim() ? 'pointer' : 'default' }}>
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ store, onAddGoal, onAddCat, onToggle, onDelete, onViewAll }: {
  store:     UserStore
  onAddGoal: () => void
  onAddCat:  () => void
  onToggle:  (id: string) => void
  onDelete:  (id: string) => void
  onViewAll: () => void
}) {
  const monday     = getMonday()
  const weekGoals  = store.goals.filter(g => g.weekStart === monday)
  const weekDone   = weekGoals.filter(g => g.status === 'done').length
  const totalDone  = store.goals.filter(g => g.status === 'done').length
  const inProgress = store.goals.filter(g => g.status === 'in_progress').length
  const pct        = weekGoals.length ? Math.round((weekDone / weekGoals.length) * 100) : 0

  const today     = new Date().getDay()
  const remaining = weekGoals.filter(g => g.status !== 'done').length
  const atRisk    = today >= 4 && remaining > 0 && weekGoals.length > 0

  const catOf = (id: string) => store.categories.find(c => c.id === id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: T.charcoal }}>Dashboard</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 3 }}>Week of {fmtDate(monday)} — keep the streak going</div>
        </div>
        <button onClick={onAddGoal} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: T.charcoal, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          ＋ New goal
        </button>
      </div>

      {/* summary banner */}
      {store.summary && (
        <div style={{ background: COLORS.teal.bg, border: `0.5px solid ${COLORS.teal.text}30`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: COLORS.teal.text }}>
          {store.summary}
        </div>
      )}

      {/* streak warning */}
      {atRisk && (
        <div style={{ background: COLORS.amber.bg, border: `0.5px solid ${COLORS.amber.text}30`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: COLORS.amber.text }}>
          ⚠️ Your streak is at risk — <strong>{remaining} goal{remaining > 1 ? 's' : ''}</strong> left this week.
        </div>
      )}

      {/* stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { dot: T.muted,              label: 'This week',   value: `${weekDone}/${weekGoals.length}`, sub: 'goals completed',              valueColor: T.charcoal            },
          { dot: COLORS.amber.text,    label: 'Streak',      value: `${store.streak}w`,                sub: 'weeks consistent',             valueColor: COLORS.amber.text     },
          { dot: COLORS.blue.text,     label: 'In progress', value: inProgress,                        sub: 'active tasks',                 valueColor: T.charcoal            },
          { dot: COLORS.teal.text,     label: 'Total done',  value: totalDone,                         sub: 'goals completed ever',         valueColor: COLORS.teal.text      },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Dot color={s.dot} />
              <span style={{ fontSize: 11, color: T.muted }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 500, color: s.valueColor, lineHeight: 1.2, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.muted }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* progress bar */}
      <div style={card}>
        <SectionHdr left="Weekly progress" right="View all →" onRight={onViewAll} />
        <div style={{ height: 6, borderRadius: 99, background: T.pill, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: T.charcoal, borderRadius: 99, transition: 'width 0.4s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.muted }}>
          <span>{weekDone} of {weekGoals.length} goals done</span>
          <span>{pct}%</span>
        </div>
      </div>

      {/* this week's goals */}
      <div style={card}>
        <SectionHdr left="This week's goals" right="+ Add goal" onRight={onAddGoal} />
        {weekGoals.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted, padding: '16px 0', textAlign: 'center' }}>
            No goals yet — <button onClick={onAddGoal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.charcoal, fontWeight: 500, fontSize: 13 }}>add your first one</button>
          </div>
        ) : (
          weekGoals.map((g, i) => (
            <GoalRow key={g.id} goal={g} cat={catOf(g.categoryId)} isLast={i === weekGoals.length - 1}
              onToggle={() => onToggle(g.id)} onDelete={() => onDelete(g.id)} />
          ))
        )}
      </div>

      {/* category breakdown */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: T.charcoal }}>Category breakdown</span>
          <button onClick={onAddCat} style={{ fontSize: 12, color: T.muted, background: 'none', border: 'none', cursor: 'pointer' }}>+ Add category</button>
        </div>
        {store.categories.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted, padding: '8px 0' }}>No categories yet — they'll appear here after onboarding.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {store.categories.map(cat => {
              const total = store.goals.filter(g => g.categoryId === cat.id).length
              const done  = store.goals.filter(g => g.categoryId === cat.id && g.status === 'done').length
              const col   = COLORS[cat.color]
              return (
                <div key={cat.id} style={{ ...card, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: col.text }}>{cat.name}</span>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: col.bg, color: col.text }}>{total}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: T.charcoal, marginBottom: 2 }}>{done}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>completed</div>
                  <div style={{ height: 3, borderRadius: 99, background: T.pill }}>
                    <div style={{ height: '100%', width: `${total ? (done / total) * 100 : 0}%`, background: col.text, borderRadius: 99, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── all goals ────────────────────────────────────────────────────────────────

function AllGoals({ store, onAddGoal, onToggle, onDelete }: {
  store:     UserStore
  onAddGoal: () => void
  onToggle:  (id: string) => void
  onDelete:  (id: string) => void
}) {
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const shown   = filter === 'all' ? store.goals : store.goals.filter(g => g.status === filter)
  const catOf   = (id: string) => store.categories.find(c => c.id === id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 500, color: T.charcoal }}>All goals</div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 3 }}>{store.goals.length} total</div>
        </div>
        <button onClick={onAddGoal} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: T.charcoal, color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          ＋ New goal
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['all', 'pending', 'in_progress', 'done'] as const).map(s => {
          const count  = s === 'all' ? store.goals.length : store.goals.filter(g => g.status === s).length
          const active = filter === s
          return (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '5px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
              background: active ? T.charcoal : T.card,
              color:      active ? '#fff' : T.muted,
              border:     `0.5px solid ${active ? T.charcoal : T.border}`,
              fontWeight: active ? 500 : 400,
            }}>
              {s === 'all' ? 'All' : s === 'in_progress' ? 'In progress' : s.charAt(0).toUpperCase() + s.slice(1)}
              <span style={{ marginLeft: 6, opacity: 0.6 }}>{count}</span>
            </button>
          )
        })}
      </div>

      <div style={card}>
        {shown.length === 0 ? (
          <div style={{ fontSize: 13, color: T.muted, padding: '16px 0', textAlign: 'center' }}>No goals here yet.</div>
        ) : (
          shown.map((g, i) => (
            <GoalRow key={g.id} goal={g} cat={catOf(g.categoryId)} isLast={i === shown.length - 1}
              onToggle={() => onToggle(g.id)} onDelete={() => onDelete(g.id)} />
          ))
        )}
      </div>
    </div>
  )
}

// ─── ai mentor ────────────────────────────────────────────────────────────────

function AIMentor({ store, onUpdateHistory }: {
  store:           UserStore
  onUpdateHistory: (h: ChatMessage[]) => void
}) {
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [store.chatHistory])

  const send = useCallback(async (text?: string) => {
    const q = (text ?? input).trim()
    if (!q || loading) return
    setInput('')

    const newHistory: ChatMessage[] = [...store.chatHistory, { role: 'user', content: q }]
    onUpdateHistory(newHistory)
    setLoading(true)

    try {
      const monday    = getMonday()
      const weekGoals = store.goals.filter(g => g.weekStart === monday).map(g => {
        const cat = store.categories.find(c => c.id === g.categoryId)
        return { title: g.title, status: g.status, category: cat?.name ?? 'Uncategorized' }
      })

      const res     = await fetch('/api/ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          mode:    'chat',
          message: q,
          history: store.chatHistory,
          profile: store.profile ?? {},
          goals:   weekGoals,
          streak:  store.streak,
        }),
      })
      const { reply } = await res.json()
      onUpdateHistory([...newHistory, { role: 'assistant', content: reply }])
    } catch {
      onUpdateHistory([...newHistory, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    }
    setLoading(false)
  }, [input, loading, store, onUpdateHistory])

  const chips = ['What should I work on this week?', 'Review my progress', 'Suggest goals for next week', 'Roadmap to reach my big goal']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 680, height: 'calc(100vh - 80px)' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 500, color: T.charcoal }}>AI mentor</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 3 }}>Focused on your goals — ask anything about your plan</div>
      </div>

      {/* chat */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4, marginBottom: 16, minHeight: 0 }}>
        {store.chatHistory.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 4 }}>
              {store.profile ? `You're working toward: "${store.profile.bigGoal}" — ask me anything.` : 'Ask me about your goals or career plan.'}
            </div>
            {chips.map(c => (
              <button key={c} onClick={() => send(c)} style={{
                padding: '10px 14px', borderRadius: 10, border: `0.5px solid ${T.border}`,
                background: T.card, color: T.charcoal, fontSize: 13, textAlign: 'left', cursor: 'pointer',
              }}>{c}</button>
            ))}
          </div>
        )}
        {store.chatHistory.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap',
              background:   m.role === 'user' ? T.charcoal : T.card,
              color:        m.role === 'user' ? '#fff' : T.charcoal,
              border:       m.role === 'user' ? 'none' : `0.5px solid ${T.border}`,
              borderRadius: m.role === 'user' ? '10px 10px 3px 10px' : '10px 10px 10px 3px',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13, color: T.muted, background: T.card, border: `0.5px solid ${T.border}` }}>Thinking…</div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* input — dark card */}
      <div style={{ borderRadius: 12, background: T.charcoal, padding: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>AI mentor</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.12)', padding: '2px 8px', borderRadius: 99 }}>online</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <style>{`#ai-msg-input::placeholder{color:rgba(255,255,255,0.45)}`}</style>
          <input id="ai-msg-input" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask about your goals, career path, or study plan…"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, background: 'rgba(255,255,255,0.10)', border: '0.5px solid rgba(255,255,255,0.15)', color: '#fff', outline: 'none' }}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#fff', color: T.charcoal, fontSize: 12, fontWeight: 500, cursor: 'pointer', opacity: input.trim() ? 1 : 0.5 }}>Ask</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chips.map(c => (
            <button key={c} onClick={() => send(c)} style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)' }}>{c}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [store,    setStore]    = useState<UserStore>(() => checkWeekRollover(loadStore()))
  const [view,     setView]     = useState<View>(() => loadStore().onboarded ? 'dashboard' : 'empty')
  const [showAdd,  setShowAdd]  = useState(false)
  const [showCat,  setShowCat]  = useState(false)

  // persist every store change
  const update = useCallback((patch: Partial<UserStore>) => {
    setStore(prev => {
      const next = { ...prev, ...patch }
      saveStore(next)
      return next
    })
  }, [])

  // goal actions
  const toggleGoal = (id: string) => {
    update({
      goals: store.goals.map(g => {
        if (g.id !== id) return g
        const done = g.status !== 'done'
        return { ...g, status: done ? 'done' : 'pending', completedAt: done ? new Date().toISOString() : null }
      })
    })
  }

  const addGoal = (title: string, catId: string) => {
    const goal: Goal = { id: uid(), title, categoryId: catId, status: 'pending', weekStart: getMonday(), completedAt: null, createdAt: new Date().toISOString() }
    update({ goals: [goal, ...store.goals] })
  }

  const deleteGoal = (id: string) => update({ goals: store.goals.filter(g => g.id !== id) })

  const addCategory = (name: string, color: ColorKey) => {
    update({ categories: [...store.categories, { id: uid(), name, color }] })
  }

  const resetOnboarding = () => {
    const fresh: UserStore = { ...EMPTY_STORE, chatHistory: store.chatHistory }
    setStore(fresh)
    saveStore(fresh)
    setView('empty')
  }

  const onOnboardingComplete = (patch: Partial<UserStore>) => {
    const next = { ...store, ...patch }
    setStore(next)
    saveStore(next)
    setView('dashboard')
  }

  const updateHistory = useCallback((h: ChatMessage[]) => {
    update({ chatHistory: h })
  }, [update])

  // ── empty state ──
  if (view === 'empty') {
    return <EmptyState onStart={() => setView('onboarding')} />
  }

  // ── onboarding ──
  if (view === 'onboarding') {
    return <Onboarding onComplete={onOnboardingComplete} />
  }

  // ── main app ──
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: T.bg }}>
      <Sidebar view={view} setView={setView} streak={store.streak} onReset={resetOnboarding} />
      <main style={{ marginLeft: 200, flex: 1, overflowY: 'auto', padding: 28 }}>
        {view === 'dashboard' && (
          <Dashboard store={store} onAddGoal={() => setShowAdd(true)} onAddCat={() => setShowCat(true)}
            onToggle={toggleGoal} onDelete={deleteGoal} onViewAll={() => setView('goals')} />
        )}
        {view === 'goals' && (
          <AllGoals store={store} onAddGoal={() => setShowAdd(true)} onToggle={toggleGoal} onDelete={deleteGoal} />
        )}
        {view === 'ai' && (
          <AIMentor store={store} onUpdateHistory={updateHistory} />
        )}
      </main>

      {showAdd && (
        <AddGoalModal categories={store.categories} onClose={() => setShowAdd(false)} onSave={addGoal} />
      )}
      {showCat && (
        <AddCatModal onClose={() => setShowCat(false)} onSave={(name, color) => { addCategory(name, color); setShowCat(false) }} />
      )}
    </div>
  )
}
