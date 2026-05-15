import React, { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import { useAuthUser } from '../hooks/useAuthUser'

type DonorProfile = { id: string; name: string; email: string; phone: string; lifetimeGiving: number }
type DonationTx = { id: string; donorId: string; amount: number; date: string; status: string; reference: string }
type Pledge = { id: string; donorId: string; amount: number; cadence: string; nextDueOn: string; status: string }
type Ack = { id: string; donorId: string; channel: string; status: string; sentAt: string }
type Pipeline = { id: string; donorId: string; stage: string; value: number; nextStep: string }

const STAGES = ['identified', 'cultivation', 'proposal', 'committed', 'stewardship']

export default function Expenses() {
  const { storeId } = useActiveStore()
  const user = useAuthUser()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [donors, setDonors] = useState<DonorProfile[]>([])
  const [history, setHistory] = useState<DonationTx[]>([])
  const [pledges, setPledges] = useState<Pledge[]>([])
  const [acks, setAcks] = useState<Ack[]>([])
  const [pipeline, setPipeline] = useState<Pipeline[]>([])
  const [selectedDonorId, setSelectedDonorId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!storeId) return
    const q1 = query(collection(db, 'donor_profiles'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'))
    const q2 = query(collection(db, 'fund_transactions'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'))
    const q3 = query(collection(db, 'donor_pledges'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'))
    const q4 = query(collection(db, 'donor_receipts'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'))
    const q5 = query(collection(db, 'donor_pipeline'), where('storeId', '==', storeId), orderBy('createdAt', 'desc'))
    const u1 = onSnapshot(q1, s => setDonors(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))))
    const u2 = onSnapshot(q2, s => setHistory(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))))
    const u3 = onSnapshot(q3, s => setPledges(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))))
    const u4 = onSnapshot(q4, s => setAcks(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))))
    const u5 = onSnapshot(q5, s => setPipeline(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))))
    return () => { u1(); u2(); u3(); u4(); u5() }
  }, [storeId])

  async function addDonor(e: React.FormEvent) {
    e.preventDefault()
    if (!storeId || !user || !name.trim()) return
    setSaving(true)
    await addDoc(collection(db, 'donor_profiles'), {
      storeId, name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), lifetimeGiving: 0,
      createdAt: serverTimestamp(), createdBy: user.uid,
    })
    setName(''); setEmail(''); setPhone('')
    setSaving(false)
  }

  const selectedHistory = useMemo(() => history.filter(h => !selectedDonorId || h.donorId === selectedDonorId), [history, selectedDonorId])

  return <section className="page" aria-label="Donor management">
    <h2 className="page__title">Donor Management (advanced)</h2>
    <p className="page__subtitle">Manage donor profiles, giving history, recurring pledges, acknowledgements, and major donor pipeline.</p>

    <section className="card"><h3 className="card__title">Donor profile</h3>
      <form onSubmit={addDonor} className="grid" style={{ gap: 12 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Donor name" required />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" />
        <button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save donor'}</button>
      </form>
    </section>

    <section className="card" style={{ marginTop: 16 }}><h3 className="card__title">Giving history</h3>
      <select value={selectedDonorId} onChange={e => setSelectedDonorId(e.target.value)}>
        <option value="">All donors</option>
        {donors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <ul>{selectedHistory.slice(0, 25).map(h => <li key={h.id}>{h.date || '—'} · {h.status || 'pending'} · {h.reference || 'n/a'} · GHS {Number(h.amount || 0).toFixed(2)}</li>)}</ul>
    </section>

    <section className="card" style={{ marginTop: 16 }}><h3 className="card__title">Recurring pledge schedules</h3>
      <p>{pledges.length} active/saved pledges.</p>
    </section>
    <section className="card" style={{ marginTop: 16 }}><h3 className="card__title">Acknowledgement & receipt tracking</h3>
      <p>{acks.length} acknowledgement records tracked.</p>
    </section>
    <section className="card" style={{ marginTop: 16 }}><h3 className="card__title">Major donor pipeline stages</h3>
      <p>Stages: {STAGES.join(' → ')}</p>
      <p>{pipeline.length} opportunities in pipeline.</p>
    </section>
  </section>
}
