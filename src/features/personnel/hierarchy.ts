export const positionOptions = [
  ['director', '销售总监'], ['supervisor', '销售主管'], ['sales', '销售人员'],
  ['clerk', '后勤文员'], ['warehouse', '仓库人员'], ['other', '其他'],
] as const

export type Position = typeof positionOptions[number][0]
export interface HierarchyPerson {
  id: string
  enabled: boolean
  permissions?: { position?: Position, supervisorId?: string }
}

export function validateHierarchy(people: HierarchyPerson[]): string {
  const byId = new Map(people.map(person => [person.id, person]))
  if (byId.size !== people.length) return '人员编号不能重复'
  for (const person of people) {
    const position = person.permissions?.position
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
