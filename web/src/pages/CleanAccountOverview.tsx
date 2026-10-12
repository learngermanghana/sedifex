import AccountOverview from './AccountOverview'
import './CleanAccountOverview.css'

export default function CleanAccountOverview() {
  return (
    <div className="clean-account-overview">
      <AccountOverview defaultAccountTab="workspace" />
    </div>
  )
}
