#!/usr/bin/env node
// Verify the deployed Sedifex MCP tool contract before refreshing the ChatGPT tool scan.
// Read-only: calls JSON-RPC tools/list without a store login or any writes.
const endpoint = process.argv[2]
if (!endpoint || !/^https:\/\//.test(endpoint)) {
  console.error('Usage: node scripts/check-chatgpt-tool-contract.mjs https://sedifex.com/api/chatgpt-mcp')
  process.exit(2)
}
const expected = {
  create_product: { scope: 'inventory:write', required: ['storeId', 'name', 'price', 'currency', 'requestId', 'confirmed'] },
  create_service: { scope: 'services:write', required: ['storeId', 'name', 'price', 'durationMinutes', 'requestId', 'confirmed'] },
  create_blog_draft: { scope: 'blog:write', required: ['storeId', 'title', 'content', 'requestId', 'confirmed'] },
  update_blog_draft: { scope: 'blog:write', required: ['storeId', 'postId', 'expectedRevision', 'title', 'content', 'requestId', 'confirmed'] },
}
try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw Error('HTTP ' + response.status)
  const payload = await response.json()
  if (!Array.isArray(payload?.result?.tools)) throw Error('Unexpected tools/list response')
  const available = new Map(payload.result.tools.map(t => [t.name, t]))
  const failures = []
  for (const [name, contract] of Object.entries(expected)) {
    const tool = available.get(name)
    if (!tool) { failures.push(name + ': missing from tools/list'); continue }
    const scopes = tool.securitySchemes?.flatMap(s => s.scopes || []) || []
    if (!scopes.includes(contract.scope)) failures.push(name + ': missing OAuth scope ' + contract.scope)
    for (const key of contract.required) {
      if (!tool.inputSchema?.required?.includes(key)) failures.push(name + ': missing required argument ' + key)
    }
    if (tool.inputSchema?.properties?.confirmed?.type !== 'boolean' ||
        !tool.inputSchema?.properties?.confirmed?.enum?.includes(true)) {
      failures.push(name + ': must declare confirmed: true')
    }
  }
  if (failures.length) {
    console.error('Deployed MCP contract is out of date:\n- ' + failures.join('\n- '))
    process.exitCode = 1
  } else {
    console.log('Deployed MCP contract OK: product and blog write tools, scopes, and approval requirements are present.')
    console.log('Next: refresh/rescan the Sedifex plugin tools and reconnect with inventory:write, services:write and blog:write.')
  }
} catch (error) {
  console.error('Unable to check deployed MCP contract:', error.message)
  process.exitCode = 1
}
