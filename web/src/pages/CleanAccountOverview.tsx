import BusinessSetupChecklist from '../components/BusinessSetupChecklist'
import AccountOverview from './AccountOverview'
import './CleanAccountOverview.css'

export default function CleanAccountOverview() {
  return (
    <div className="clean-account-overview">
      <BusinessSetupChecklist />
      <AccountOverview defaultAccountTab="workspace" />
    </div>
  )
}
