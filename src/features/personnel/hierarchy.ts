export const positionOptions = [
  ['director', '销售总监'], ['supervisor', '销售主管'], ['sales', '销售人员'],
  ['clerk', '后勤文员'], ['warehouse', '仓库人员'], ['other', '其他'],
] as const

export type Position = typeof positionOptions[number][0]
export interface HierarchyPerson {
  id: string
  enabled: boolean
  permissions?: { position?: Position, supervisorId?: string, customerScope?: string, managedDepartmentIds?: readonly string[] }
}

export function validateHierarchy(people: HierarchyPerson[]): string {
  const byId = new Map(people.map(person => [person.id, person]))
  if (byId.size !== people.length) return '人员编号不能重复'
  for (const person of people) {
    const position = person.permissions?.position
    const scope = person.permissions?.customerScope
    if (scope !== undefined && !['own', 'team', 'all'].includes(scope)) return '客户范围无效'
    const managed = person.permissions?.managedDepartmentIds
    if (managed !== undefined && (!Array.isArray(managed) || managed.some(id => typeof id !== 'string' || !id.trim() || id !== id.trim()) || new Set(managed).size !== managed.length)) return '管理部门必须为不重复的部门编号数组'
    if (managed?.length && position !== 'director') return '只有销售总监可以指定管理部门'
    if (scope === 'team' && position !== 'supervisor' && position !== 'director') return '团队范围仅适用于销售主管和总监'
    if (person.permissions?.supervisorId !== undefined && typeof person.permissions.supervisorId !== 'string') return '直属上级编号无效'
    if (position && !positionOptions.some(([value]) => value === position)) return '岗位类型无效'
    const visited = new Set([person.id])
    let current = person
    while (current.permissions?.supervisorId) {
      const id = current.permissions.supervisorId
      if (visited.has(id)) return '直属上级不能是本人或形成循环'
      visited.add(id)
      const parent = byId.get(id)
      if (!parent) return '直属上级不存在'
      if (person.enabled && !parent.enabled) return '启用人员不能归属停用的上级'
      if (parent.permissions?.position !== 'director' && parent.permissions?.position !== 'supervisor') return '直属上级必须为销售总监或销售主管'
      current = parent
    }
  }
  return ''
}
