export function samplePermissions(user?: {
  enabled: boolean
  role: string
  permissions: { issueSamples?: boolean, manageSampleStock?: boolean }
}) {
  if (!user?.enabled || user.role === 'viewer')
    return { issue: false, maintain: false }
  return {
    issue: user.role === 'owner' || user.permissions.issueSamples === true,
    maintain: user.role === 'owner' || user.permissions.manageSampleStock === true,
  }
}
