import React from 'react'
import { Outlet } from 'react-router-dom'
import AskSedifexAgent from '../components/AskSedifexAgent'
import Shell from './Shell'

export function ShellLayout() {
  return (
    <Shell>
      <Outlet />
      <AskSedifexAgent enabled />
    </Shell>
  )
}

export default ShellLayout
