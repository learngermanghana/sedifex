import React from 'react'
import { Link } from 'react-router-dom'

export default function QuickPayLanding() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col items-center justify-center text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-400 to-cyan-300 text-3xl font-black text-white shadow-2xl">
          Sx
        </div>
        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-200">Sedifex Quick Pay</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">Scan a business QR to pay</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
          This payment domain is for Sedifex Quick Pay links. Open the QR code from a business poster, flyer, WhatsApp link, or counter display to search items and pay securely.
        </p>

        <div className="mt-8 grid gap-4 rounded-3xl border border-white/10 bg-white/10 p-6 text-left shadow-2xl sm:grid-cols-3">
          <div>
            <p className="text-2xl font-black text-cyan-200">1</p>
            <h2 className="mt-2 font-bold">Scan QR</h2>
            <p className="mt-1 text-sm text-slate-300">Use your camera to open the business payment page.</p>
          </div>
          <div>
            <p className="text-2xl font-black text-cyan-200">2</p>
            <h2 className="mt-2 font-bold">Search item</h2>
            <p className="mt-1 text-sm text-slate-300">Choose the product, service, or course you want.</p>
          </div>
          <div>
            <p className="text-2xl font-black text-cyan-200">3</p>
            <h2 className="mt-2 font-bold">Pay securely</h2>
            <p className="mt-1 text-sm text-slate-300">Your order is recorded for the business in Sedifex.</p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link className="rounded-2xl bg-white px-6 py-3 font-semibold text-slate-950" to="https://www.sedifex.com">
            Visit Sedifex
          </Link>
          <Link className="rounded-2xl border border-white/20 px-6 py-3 font-semibold text-white" to="/pricing">
            Create a business account
          </Link>
        </div>
      </section>
    </main>
  )
}
