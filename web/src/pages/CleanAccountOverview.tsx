import { Link } from 'react-router-dom'
import PublicLinkSummaryCard from '../components/PublicLinkSummaryCard'
import { useActiveStore } from '../hooks/useActiveStore'
import { useStorePreferences } from '../hooks/useStorePreferences'
import AccountOverview from './AccountOverview'
import './CleanAccountOverview.css'

export default function CleanAccountOverview() {
  const { storeId } = useActiveStore()
  const { preferences } = useStorePreferences(storeId)
  const enabledModules = new Set(preferences.navigation.enabledModules)
  const bookingsEnabled = enabledModules.has('bookings')
  const customersEnabled = enabledModules.has('customers')

  return (
    <div className="clean-account-overview">
      <PublicLinkSummaryCard />
      <section className="clean-account-overview__operations" aria-labelledby="business-operations-title">
        <div>
          <p>Business operations</p>
          <h2 id="business-operations-title">Core admin tools</h2>
          <span>Bookings, payment activity and payout setup are kept separate from your Sedifex plan and billing.</span>
        </div>
        <nav aria-label="Business operation shortcuts">
          {bookingsEnabled ? <Link to="/bookings"><strong>Bookings</strong><span>Review and update client bookings</span></Link> : null}
          {customersEnabled ? <Link to="/customers"><strong>Clients</strong><span>Review customer records and balances</span></Link> : null}
          <Link to="/settlement"><strong>Payments</strong><span>Track booking and website payments</span></Link>
          <Link to="/settlement/setup"><strong>Payout account</strong><span>Manage Paystack settlement details</span></Link>
        </nav>
      </section>
      <AccountOverview defaultAccountTab="workspace" />
    </div>
  )
}