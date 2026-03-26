'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import PoweredBy from '@/components/PoweredBy'

interface User {
  id: string; name: string; email: string; role: string;
  can_assign: boolean; active: boolean
}

export default function AdminPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('agent')
  const [canAssign, setCanAssign] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ role: string } | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.success) {
        setCurrentUser(d.data)
        if (d.data.role !== 'admin') router.push('/dashboard')
      }
    })
    fetchUsers()
  }, [router])

  async function fetchUsers() {
    const res = await fetch('/api/users')
    const data = await res.json()
    if (data.success) setUsers(data.data)
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role, can_assign: canAssign }),
    })
    const data = await res.json()
    if (data.success) {
      setName(''); setEmail(''); setPassword(''); setRole('agent'); setCanAssign(false)
      setShowForm(false)
      fetchUsers()
    } else {
      alert(data.error)
    }
  }

  async function toggleField(userId: string, field: 'can_assign' | 'active', currentValue: boolean) {
    await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, [field]: !currentValue }),
    })
    fetchUsers()
  }

  if (!currentUser || currentUser.role !== 'admin') return null

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-6 flex-1">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-text">User Management</h1>
            <p className="text-sm text-dim mt-0.5">{users.length} users configured</p>
            <a href="/admin/setup" className="text-xs text-accent hover:text-accent-hover transition-colors mt-1 inline-flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Setup Health Check
            </a>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            {showForm ? (
              'Cancel'
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add User
              </>
            )}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="bg-card border border-border rounded-xl p-5 mb-6 space-y-4">
            <h2 className="text-sm font-semibold text-muted">New User</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50" placeholder="Full name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50" placeholder="user@tbwxpress.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50" placeholder="Set password" />
              </div>
              <div>
                <label className="block text-xs font-medium text-dim mb-1">Role</label>
                <select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent/50">
                  <option value="agent">Agent</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
              <input type="checkbox" checked={canAssign} onChange={e => setCanAssign(e.target.checked)} className="rounded accent-accent" />
              Can assign leads to others
            </label>
            <button type="submit" className="bg-accent hover:bg-accent-hover text-[#1a1209] text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              Create User
            </button>
          </form>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {users.map(u => (
              <div key={u.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between hover:border-border-light transition-colors">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    u.role === 'admin' ? 'bg-accent/20' : 'bg-elevated'
                  }`}>
                    <span className={`text-sm font-bold ${u.role === 'admin' ? 'text-accent' : 'text-muted'}`}>
                      {u.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text text-sm">{u.name}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        u.role === 'admin'
                          ? 'bg-accent/15 text-accent'
                          : 'bg-elevated text-muted'
                      }`}>
                        {u.role}
                      </span>
                      {!u.active && <span className="text-[10px] text-danger font-medium">(Inactive)</span>}
                    </div>
                    <p className="text-xs text-dim mt-0.5">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-xs text-dim cursor-pointer">
                    <span>Can Assign</span>
                    <button
                      onClick={() => toggleField(u.id, 'can_assign', u.can_assign)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${u.can_assign ? 'bg-accent' : 'bg-border'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${u.can_assign ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-dim cursor-pointer">
                    <span>Active</span>
                    <button
                      onClick={() => toggleField(u.id, 'active', u.active)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${u.active ? 'bg-success' : 'bg-border'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${u.active ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <PoweredBy />
    </div>
  )
}
