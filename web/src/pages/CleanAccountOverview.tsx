import PublicLinkSummaryCard from '../components/PublicLinkSummaryCard'
import AccountOverview from './AccountOverview'
import './CleanAccountOverview.css'

export default function CleanAccountOverview() {
  return (
    <div className="clean-account-overview">
      <PublicLinkSummaryCard />
      <AccountOverview defaultAccountTab="workspace" />
    </div>
  )
}