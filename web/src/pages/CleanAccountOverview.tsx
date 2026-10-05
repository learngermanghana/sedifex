import { Link } from 'react-router-dom'
import PublicLinkSummaryCard from '../components/PublicLinkSummaryCard'
import AccountOverview from './AccountOverview'
import './CleanAccountOverview.css'

export default function CleanAccountOverview() {
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
          <Link to="/bookings"><strong>Bookings</strong><span>Review and update client bookings</span></Link>
          <Link to="/settlement"><strong>Payments</strong><span>Track booking and website payments</span></Link>
          <Link to="/settlement/setup"><strong>Payout account</strong><span>Manage Paystack settlement details</span></Link>
        </nav>
      </section>
      <AccountOverview defaultAccountTab="workspace" />
    </div>
  )
}