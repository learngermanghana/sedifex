import { NavLink } from 'react-router-dom'

export default function PaymentNavigation() {
  return <nav className="payment-navigation" aria-label="Payment sections">
    <NavLink to="/settlement" end>Payment activity</NavLink>
    <NavLink to="/settlement/setup">Payout account</NavLink>
    <NavLink to="/account?section=billing">Plan & billing</NavLink>
  </nav>
}
