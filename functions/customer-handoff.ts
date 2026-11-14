export const updateHandoffOwner = `
  UPDATE crm_customers SET owner = ?, assigned_to_user_id = ?, value = ?,
    row_revision = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND row_revision = ? AND assigned_to_user_id = ?
    AND EXISTS (SELECT 1 FROM users WHERE id = ? AND enabled = 1 AND role IN ('quoter', 'manager'))
`

export const insertHandoffLog = `
  INSERT INTO crm_customer_handoffs
    (id, customer_id, from_user_id, to_user_id, actor_user_id, reason, progress_note, next_action, due_at)
  SELECT ?, id, ?, assigned_to_user_id, ?, ?, ?, ?, ?
  FROM crm_customers WHERE id = ? AND row_revision = ?
`

export function canExecuteHandoff(role: string, permissions: Record<string, boolean>) {
  return role === 'owner'
    || (role === 'manager' && permissions.viewAllCustomers === true && permissions.transferCustomers === true)
}
