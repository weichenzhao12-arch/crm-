import { defineStore } from 'pinia'
import { getCloudState, putCloudState } from '~/api/cloud-storage'
import { pruneSevenDayRecords, restoreRecycleRecord } from '~/features/system/recycle'
import { useAdminStore } from '~/stores/admin'

export type RecycleTargetType = 'customer' | 'product' | 'material'
export type OperationAction = 'create' | 'update' | 'delete' | 'restore' | 'permanent-delete' | 'import' | 'transfer'

export interface RecycleRecord {
  id: string
  type: RecycleTargetType
  name: string
  item: any
  deletedAt: string
  deletedBy: string
}

export interface OperationLogRecord {
  id: string
  action: OperationAction
  type: RecycleTargetType | 'user' | 'pricing' | 'lead'
  name: string
  actor: string
  createdAt: string
  detail: string
}

interface SystemState {
  recycleBin: RecycleRecord[]
  operationLogs: OperationLogRecord[]
}

const STORAGE_KEY = 'quote-crm-system-state'

function nowIso() {
  return new Date().toISOString()
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function defaultState(): SystemState {
  return { recycleBin: [], operationLogs: [] }
}

function loadSystemState(): SystemState {
  if (typeof localStorage === 'undefined')
    return defaultState()

  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved)
    return defaultState()

  try {
    const parsed = JSON.parse(saved) as Partial<SystemState>
    return {
      recycleBin: Array.isArray(parsed.recycleBin) ? pruneSevenDayRecords(parsed.recycleBin as RecycleRecord[]) : [],
      operationLogs: Array.isArray(parsed.operationLogs) ? pruneSevenDayRecords(parsed.operationLogs as any[]) as OperationLogRecord[] : [],
    }
  }
  catch {
    return defaultState()
  }
}

export const useSystemStore = defineStore('system', {
  state: () => loadSystemState(),
  getters: {
    recentLogs: state => pruneSevenDayRecords(state.operationLogs as any[]) as OperationLogRecord[],
    activeRecycleBin: state => pruneSevenDayRecords(state.recycleBin),
  },
  actions: {
    actorName() {
      const admin = useAdminStore()
      return admin.currentUser?.displayName || admin.currentUser?.account || '系统'
    },
    prune() {
      this.recycleBin = pruneSevenDayRecords(this.recycleBin)
      this.operationLogs = pruneSevenDayRecords(this.operationLogs as any[]) as OperationLogRecord[]
    },
    save() {
      this.prune()
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        recycleBin: this.recycleBin,
        operationLogs: this.operationLogs,
      }))
      putCloudState('system-state', {
        recycleBin: this.recycleBin,
        operationLogs: this.operationLogs,
      }).catch(() => {})
    },
    async loadCloudSystemState() {
      const state = await getCloudState<Partial<SystemState>>('system-state').catch(() => null)
      if (!state)
        return

      this.recycleBin = Array.isArray(state.recycleBin) ? state.recycleBin : []
      this.operationLogs = Array.isArray(state.operationLogs) ? state.operationLogs : []
      this.save()
    },
    log(action: OperationAction, type: OperationLogRecord['type'], name: string, detail = '') {
      this.operationLogs.unshift({
        id: createId('log'),
        action,
        type,
        name,
        actor: this.actorName(),
        createdAt: nowIso(),
        detail,
      })
      this.save()
    },
    addRecycle(type: RecycleTargetType, name: string, item: unknown) {
      this.recycleBin.unshift({
        id: createId('recycle'),
        type,
        name,
        item: clone(item),
        deletedAt: nowIso(),
        deletedBy: this.actorName(),
      })
      this.log('delete', type, name, '已进入回收站，保留7天')
      this.save()
    },
    restore(id: string) {
      const restored = restoreRecycleRecord(this.recycleBin, id)
      if (!restored.record)
        return null

      this.recycleBin = restored.records as RecycleRecord[]
      this.log('restore', restored.record.type, restored.record.name, '从回收站恢复')
      this.save()
      return clone(restored.item)
    },
    permanentDelete(id: string) {
      const record = this.recycleBin.find(item => item.id === id)
      if (!record)
        return

      this.recycleBin = this.recycleBin.filter(item => item.id !== id)
      this.log('permanent-delete', record.type, record.name, '从回收站永久删除')
      this.save()
    },
  },
})
