import React, { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'

import {
  beginGoogleAdsOAuth,
  createOrUpdateCampaign,
  pauseOrResumeCampaign,
  saveCampaignBrief,
} from '../api/googleAdsAutomation'
import { db } from '../firebase'
import { useActiveStore } from '../hooks/useActiveStore'
import './AdsCampaigns.css'

type CampaignGoal = 'leads' | 'sales' | 'traffic' | 'calls' | 'awareness'
type CampaignStatus = 'draft' | 'live' | 'paused'

type GoogleAdsConnection = {
  connected: boolean
  accountEmail: string
  customerId: string
  managerId: string
  connectedAt?: unknown
}

type BillingConfirmation = {
  confirmed: boolean
  legalName: string
  confirmedAt?: unknown
}

type CampaignBrief = {
  goal: CampaignGoal
  location: string
  dailyBudget: number
  landingPageUrl: string
  headline: string
  description: string
}

type CampaignSnapshot = {
  status: CampaignStatus
  campaignId: string
  adGroupName: string
  updatedAt?: unknown
}

type PerformanceMetrics = {
  spend: number
  leads: number
  cpa: number
}

type AdsAutomationSettings = {
  connection: GoogleAdsConnection
  billing: BillingConfirmation
  brief: CampaignBrief
  campaign: CampaignSnapshot
  metrics: PerformanceMetrics
}

const DEFAULT_SETTINGS: AdsAutomationSettings = {
  connection: {
    connected: false,
    accountEmail: '',
    customerId: '',
    managerId: '',
  },
  billing: {
    confirmed: false,
    legalName: '',
  },
  brief: {
    goal: 'leads',
    location: '',
    dailyBudget: 30,
    landingPageUrl: '',
    headline: '',
    description: '',
  },
  campaign: {
    status: 'draft',
    campaignId: '',
    adGroupName: '',
  },
  metrics: {
    spend: 0,
    leads: 0,
    cpa: 0,
  },
}

function toNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function parseSettings(raw: Record<string, unknown> | undefined): AdsAutomationSettings {
  const source = (raw?.googleAdsAutomation as Record<string, unknown> | undefined) ?? {}
  const connectionRaw = (source.connection as Record<string, unknown> | undefined) ?? {}
  const billingRaw = (source.billing as Record<string, unknown> | undefined) ?? {}
  const briefRaw = (source.brief as Record<string, unknown> | undefined) ?? {}
  const campaignRaw = (source.campaign as Record<string, unknown> | undefined) ?? {}
  const metricsRaw = (source.metrics as Record<string, unknown> | undefined) ?? {}

  const goal = typeof briefRaw.goal === 'string' ? briefRaw.goal : DEFAULT_SETTINGS.brief.goal
  const status = typeof campaignRaw.status === 'string' ? campaignRaw.status : DEFAULT_SETTINGS.campaign.status

  return {
    connection: {
      connected: connectionRaw.connected === true,
      accountEmail:
        typeof connectionRaw.accountEmail === 'string' ? connectionRaw.accountEmail : '',
      customerId: typeof connectionRaw.customerId === 'string' ? connectionRaw.customerId : '',
      managerId: typeof connectionRaw.managerId === 'string' ? connectionRaw.managerId : '',
      connectedAt: connectionRaw.connectedAt,
    },
    billing: {
      confirmed: billingRaw.confirmed === true,
      legalName: typeof billingRaw.legalName === 'string' ? billingRaw.legalName : '',
      confirmedAt: billingRaw.confirmedAt,
    },
    brief: {
      goal:
        goal === 'sales' || goal === 'traffic' || goal === 'calls' || goal === 'awareness' || goal === 'leads'
          ? goal
          : DEFAULT_SETTINGS.brief.goal,
      location: typeof briefRaw.location === 'string' ? briefRaw.location : '',
      dailyBudget: toNumber(briefRaw.dailyBudget, DEFAULT_SETTINGS.brief.dailyBudget),
      landingPageUrl:
        typeof briefRaw.landingPageUrl === 'string' ? briefRaw.landingPageUrl : '',
      headline: typeof briefRaw.headline === 'string' ? briefRaw.headline : '',
      description: typeof briefRaw.description === 'string' ? briefRaw.description : '',
    },
    campaign: {
      status: status === 'live' || status === 'paused' || status === 'draft' ? status : 'draft',
      campaignId: typeof campaignRaw.campaignId === 'string' ? campaignRaw.campaignId : '',
      adGroupName: typeof campaignRaw.adGroupName === 'string' ? campaignRaw.adGroupName : '',
      updatedAt: campaignRaw.updatedAt,
    },
    metrics: {
      spend: toNumber(metricsRaw.spend, 0),
      leads: Math.max(0, Math.round(toNumber(metricsRaw.leads, 0))),
      cpa: toNumber(metricsRaw.cpa, 0),
    },
  }
}

function toIso(value: unknown): string {
  if (!value) return '—'
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate()
    if (!Number.isNaN(date.getTime())) return date.toLocaleString()
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleString()
  }
  return '—'
}

export default function AdsCampaigns() {
  const { storeId } = useActiveStore()
  const [settings, setSettings] = useState<AdsAutomationSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const oauthState = params.get('googleOAuth')
    const oauthMessage = params.get('message')
    if (!oauthState) return

    if (oauthState === 'success') {
      setNotice(oauthMessage || 'Google Ads connected.')
    } else {
      setNotice(oauthMessage || 'Google OAuth failed.')
    }

    params.delete('googleOAuth')
    params.delete('message')
    const nextQuery = params.toString()
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`
    window.history.replaceState({}, '', nextUrl)
  }, [])

  useEffect(() => {
    if (!storeId) {
      setSettings(DEFAULT_SETTINGS)
      return undefined
    }

    setLoading(true)
    const unsubscribe = onSnapshot(
      doc(db, 'storeSettings', storeId),
      snapshot => {
        setSettings(parseSettings(snapshot.data() as Record<string, unknown> | undefined))
        setLoading(false)
      },
      () => {
        setLoading(false)
      },
    )

    return unsubscribe
  }, [storeId])

  const canLaunch =
    settings.connection.connected &&
    settings.billing.confirmed &&
    settings.brief.location.trim() &&
    settings.brief.landingPageUrl.trim() &&
    settings.brief.headline.trim() &&
    settings.brief.description.trim() &&
    settings.brief.dailyBudget > 0

  const campaignStateLabel = useMemo(() => {
    if (settings.campaign.status === 'live') return 'Live campaign is running.'
    if (settings.campaign.status === 'paused') return 'Campaign paused.'
    return 'Campaign draft is ready for launch.'
  }, [settings.campaign.status])

  async function saveChanges(changes: Partial<AdsAutomationSettings>) {
    if (!storeId) return
    setSaving(true)
    setNotice(null)
    try {
      await setDoc(
        doc(db, 'storeSettings', storeId),
        {
          googleAdsAutomation: {
            ...changes,
          },
        },
        { merge: true },
      )
      setNotice('Saved.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save changes right now.'
      setNotice(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleConnectClick() {
    if (!settings.connection.accountEmail.trim()) {
      setNotice('Add the Google account email first.')
      return
    }

    if (!storeId) return

    setSaving(true)
    setNotice(null)
    try {
      const { url } = await beginGoogleAdsOAuth({
        storeId,
        accountEmail: settings.connection.accountEmail,
        managerId: settings.connection.managerId,
      })
      window.location.assign(url)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start Google OAuth.'
      setNotice(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleBillingConfirmClick() {
    if (!settings.billing.legalName.trim()) {
      setNotice('Enter the business legal name used for billing.')
      return
    }

    await saveChanges({
      billing: {
        ...settings.billing,
        confirmed: true,
        confirmedAt: serverTimestamp(),
      },
    })
  }

  async function handleCreateCampaign() {
    if (!canLaunch) {
      setNotice('Complete connection, billing confirmation, and campaign brief first.')
      return
    }

    if (!storeId) return

    setSaving(true)
    setNotice(null)
    try {
      await createOrUpdateCampaign({
        storeId,
        brief: settings.brief,
      })
      setNotice('Campaign is live.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create campaign.'
      setNotice(message)
    } finally {
      setSaving(false)
    }
  }

  async function handlePauseToggle() {
    if (!storeId) return
    setSaving(true)
    setNotice(null)
    try {
      const resume = settings.campaign.status === 'paused'
      await pauseOrResumeCampaign({ storeId, resume })
      setNotice(resume ? 'Campaign resumed.' : 'Campaign paused.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to change campaign state.'
      setNotice(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="ads-campaigns">
      <header className="ads-campaigns__header">
        <h1>Google Ads automation</h1>
        <p>
          Connect Google Ads, capture the campaign brief, and run campaigns from Sedifex.
        </p>
      </header>

      {loading ? <p className="ads-campaigns__status">Loading Google Ads workspace…</p> : null}
      {notice ? <p className="ads-campaigns__status">{notice}</p> : null}

      <section className="ads-campaigns__section" aria-labelledby="google-connect">
        <div>
          <h2 id="google-connect">1) Connect Google Ads</h2>
          <p>
            Complete OAuth consent in your Google Cloud app, then save the account selected for this workspace.
          </p>
        </div>

        <div className="ads-campaigns__form-grid">
          <label>
            <span>Google account email</span>
            <input
              type="email"
              value={settings.connection.accountEmail}
              onChange={event =>
                setSettings(previous => ({
                  ...previous,
                  connection: {
                    ...previous.connection,
                    accountEmail: event.target.value,
                  },
                }))
              }
              placeholder="owner@business.com"
            />
          </label>

          <label>
            <span>Manager account ID (optional)</span>
            <input
              type="text"
              value={settings.connection.managerId}
              onChange={event =>
                setSettings(previous => ({
                  ...previous,
                  connection: {
                    ...previous.connection,
                    managerId: event.target.value,
                  },
                }))
              }
              placeholder="098-765-4321"
            />
          </label>

          <div className="ads-campaigns__actions">
            <button
              type="button"
              className="button button--primary"
              disabled={saving}
              onClick={handleConnectClick}
            >
              {settings.connection.connected ? 'Update connection' : 'Connect Google Ads'}
            </button>
            <p>
              Connected: <strong>{settings.connection.connected ? 'Yes' : 'No'}</strong> · Last updated:{' '}
              {toIso(settings.connection.connectedAt)}
            </p>
          </div>
        </div>
      </section>

      <section className="ads-campaigns__section" aria-labelledby="billing-ownership">
        <div>
          <h2 id="billing-ownership">2) Confirm billing ownership</h2>
          <p>Capture consent before Sedifex starts spending ad budget.</p>
        </div>

        <div className="ads-campaigns__form-grid">
          <label>
            <span>Business legal name</span>
            <input
              value={settings.billing.legalName}
              onChange={event =>
                setSettings(previous => ({
                  ...previous,
                  billing: {
                    ...previous.billing,
                    legalName: event.target.value,
                  },
                }))
              }
              placeholder="Sedifex Biz Ltd"
            />
          </label>
          <div className="ads-campaigns__actions">
            <button
              type="button"
              className="button button--primary"
              disabled={saving}
              onClick={handleBillingConfirmClick}
            >
              Confirm billing ownership
            </button>
            <p>
              Confirmed: <strong>{settings.billing.confirmed ? 'Yes' : 'No'}</strong> · At{' '}
              {toIso(settings.billing.confirmedAt)}
            </p>
          </div>
        </div>
      </section>

      <section className="ads-campaigns__section" aria-labelledby="campaign-brief">
        <div>
          <h2 id="campaign-brief">3) Campaign brief</h2>
          <p>Define the goal, location, budget, and creative copy for launch.</p>
        </div>

        <div className="ads-campaigns__form-grid">
          <label>
            <span>Goal</span>
            <select
              value={settings.brief.goal}
              onChange={event =>
                setSettings(previous => ({
                  ...previous,
                  brief: {
                    ...previous.brief,
                    goal: event.target.value as CampaignGoal,
                  },
                }))
              }
            >
              <option value="leads">Leads</option>
              <option value="sales">Sales</option>
              <option value="traffic">Website traffic</option>
              <option value="calls">Phone calls</option>
              <option value="awareness">Brand awareness</option>
            </select>
          </label>

          <label>
            <span>Target location</span>
            <input
              value={settings.brief.location}
              onChange={event =>
                setSettings(previous => ({
                  ...previous,
                  brief: {
                    ...previous.brief,
                    location: event.target.value,
                  },
                }))
              }
              placeholder="Accra, Kumasi"
            />
          </label>

          <label>
            <span>Daily budget (USD)</span>
            <input
              type="number"
              min={1}
              value={settings.brief.dailyBudget}
              onChange={event =>
                setSettings(previous => ({
                  ...previous,
                  brief: {
                    ...previous.brief,
                    dailyBudget: Number(event.target.value || 0),
                  },
                }))
              }
            />
          </label>

          <label>
            <span>Landing page URL</span>
            <input
              type="url"
              value={settings.brief.landingPageUrl}
              onChange={event =>
                setSettings(previous => ({
                  ...previous,
                  brief: {
                    ...previous.brief,
                    landingPageUrl: event.target.value,
                  },
                }))
              }
              placeholder="https://your-domain.com/offer"
            />
          </label>

          <label>
            <span>Headline</span>
            <input
              value={settings.brief.headline}
              onChange={event =>
                setSettings(previous => ({
                  ...previous,
                  brief: {
                    ...previous.brief,
                    headline: event.target.value,
                  },
                }))
              }
              placeholder="Get same-day delivery"
            />
          </label>

          <label>
            <span>Description</span>
            <textarea
              rows={4}
              value={settings.brief.description}
              onChange={event =>
                setSettings(previous => ({
                  ...previous,
                  brief: {
                    ...previous.brief,
                    description: event.target.value,
                  },
                }))
              }
              placeholder="Order before 6pm and receive it today."
            />
          </label>

          <div className="ads-campaigns__actions">
            <button
              type="button"
              className="button button--ghost"
              disabled={saving}
              onClick={() =>
                void (async () => {
                  if (!storeId) return
                  setSaving(true)
                  setNotice(null)
                  try {
                    await saveCampaignBrief({ storeId, brief: settings.brief })
                    setNotice('Brief saved.')
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Unable to save brief.'
                    setNotice(message)
                  } finally {
                    setSaving(false)
                  }
                })()
              }
            >
              Save brief
            </button>
          </div>
        </div>
      </section>

      <section className="ads-campaigns__section" aria-labelledby="campaign-control">
        <div>
          <h2 id="campaign-control">4) Launch + controls</h2>
          <p>{campaignStateLabel}</p>
        </div>

        <div className="ads-campaigns__actions ads-campaigns__actions--split">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void handleCreateCampaign()}
            disabled={saving || !canLaunch}
          >
            {settings.campaign.status === 'draft' ? 'Create campaign' : 'Update live campaign'}
          </button>

          <button
            type="button"
            className="button button--ghost"
            disabled={saving || settings.campaign.status === 'draft'}
            onClick={() => void handlePauseToggle()}
          >
            {settings.campaign.status === 'paused' ? 'Resume campaign' : 'Pause campaign'}
          </button>
        </div>

        <div className="ads-campaigns__metrics-grid">
          <article>
            <h3>Spend</h3>
            <p>${settings.metrics.spend.toFixed(2)}</p>
          </article>
          <article>
            <h3>Leads</h3>
            <p>{settings.metrics.leads}</p>
          </article>
          <article>
            <h3>CPA</h3>
            <p>${settings.metrics.cpa.toFixed(2)}</p>
          </article>
          <article>
            <h3>Status</h3>
            <p>{settings.campaign.status.toUpperCase()}</p>
          </article>
        </div>
      </section>
    </main>
  )
}
