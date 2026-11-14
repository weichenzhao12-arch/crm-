export type CustomerAction = 'read' | 'create' | 'edit' | 'transfer' | 'export' | 'delete' | 'restore'
export type CustomerScope = 'own' | 'team' | 'all'

export interface CustomerActor {
  id: string
  scope: CustomerScope
  actions: readonly CustomerAction[]
  teamMemberIds?: readonly string[]
}

export function canAccessCustomer(actor: CustomerActor, action: CustomerAction, ownerId: string): boolean {
  if (!actor.id || !ownerId || !actor.actions.includes(action))
    return false

  return ownerId === actor.id
    || actor.scope === 'all'
    || (actor.scope === 'team' && actor.teamMemberIds?.includes(ownerId) === true)
}

export function canTransferCustomer(actor: CustomerActor, fromId: string, toId: string): boolean {
  return fromId !== toId
    && canAccessCustomer(actor, 'transfer', fromId)
    && canAccessCustomer(actor, 'transfer', toId)
}
