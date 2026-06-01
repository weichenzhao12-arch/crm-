import { defineStore } from 'pinia'
import { getCloudState, putCloudState } from '~/api/cloud-storage'

export type CustomerStage = 'new' | 'quoted' | 'follow' | 'won' | 'lost'
export type IntentLevel = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface CrmFollowUp {
  id: string
  date: string
  content: string
  nextAction: string
  reminderDate?: string
  reminderTime?: string
  reminderDone?: boolean
}

export interface CrmQuoteRecord {
  id: string
  date: string
  title: string
  amount: number
  status: string
  isWon?: boolean
  dealAmount?: number
  dealDate?: string
  quoteFileName?: string
  quoteFileDataUrl?: string
  contractFileName?: string
  contractFileDataUrl?: string
}

export interface CrmCustomer {
  id: string
  date: string
  name: string
  contact: string
  phone: string
  wechat: string
  sourceAccount: string
  dealAttribute: string
  customerAttribute: string
  region: string
  projectType: string
  intentLevel: IntentLevel
  scenario: string
  area: number
  usageTime: string
  communication: string
  sampleSent: boolean
  sampleSpec: string
  sampleTrackingNo: string
  stage: CustomerStage
  owner: string
  assignedToUserId: string
  createdByUserId: string
  remark: string
  followUps: CrmFollowUp[]
  quotes: CrmQuoteRecord[]
}

const STORAGE_KEY = 'quote-crm-customers'

function today() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeCustomer(raw: Partial<CrmCustomer>): CrmCustomer {
  return {
    id: raw.id || createId('customer'),
    date: raw.date || today(),
    name: raw.name || '未命名客户',
    contact: raw.contact || '',
    phone: raw.phone || '',
    wechat: raw.wechat || '',
    sourceAccount: raw.sourceAccount || '',
    dealAttribute: raw.dealAttribute || '',
    customerAttribute: raw.customerAttribute || '',
    region: raw.region || '',
    projectType: raw.projectType || '足球场',
    intentLevel: raw.intentLevel || 'C',
    scenario: raw.scenario || raw.projectType || '足球场',
    area: Number(raw.area) || 0,
    usageTime: raw.usageTime || '',
    communication: raw.communication || raw.remark || '',
    sampleSent: Boolean(raw.sampleSent),
    sampleSpec: raw.sampleSpec || '',
    sampleTrackingNo: raw.sampleTrackingNo || '',
    stage: raw.stage || 'new',
    owner: raw.owner || '',
    assignedToUserId: raw.assignedToUserId || 'owner',
    createdByUserId: raw.createdByUserId || 'owner',
    remark: raw.remark || '',
    followUps: Array.isArray(raw.followUps)
      ? raw.followUps.map(follow => ({
        id: follow.id || createId('follow'),
        date: follow.date || today(),
        content: follow.content || '',
        nextAction: follow.nextAction || '',
        reminderDate: follow.reminderDate || '',
        reminderTime: follow.reminderTime || '',
        reminderDone: Boolean(follow.reminderDone),
      }))
      : [],
    quotes: Array.isArray(raw.quotes)
      ? raw.quotes.map(quote => ({
        id: quote.id || createId('quote'),
        date: quote.date || today(),
        title: quote.title || '报价记录',
        amount: Number(quote.amount) || 0,
        status: quote.status || '已报价',
        isWon: Boolean(quote.isWon),
        dealAmount: Number(quote.dealAmount) || 0,
        dealDate: quote.dealDate || quote.date || today(),
        quoteFileName: quote.quoteFileName || '',
        quoteFileDataUrl: quote.quoteFileDataUrl || '',
        contractFileName: quote.contractFileName || '',
        contractFileDataUrl: quote.contractFileDataUrl || '',
      }))
      : [],
  }
}

function defaultCustomers(): CrmCustomer[] {
  return [
    normalizeCustomer({
      id: 'customer-demo-1',
      date: today(),
      name: '示例客户A',
      contact: '张经理',
      phone: '13800000000',
      wechat: 'zhang-demo',
      region: '山东',
      sourceAccount: '抖音',
      dealAttribute: '高',
      customerAttribute: 'B端',
      projectType: '足球场',
      scenario: '学校足球场',
      intentLevel: 'B',
      area: 3275,
      usageTime: '近期',
      communication: '客户关注总价和辅料明细。',
      sampleSent: false,
      stage: 'quoted',
      owner: '销售一部',
      assignedToUserId: 'owner',
      remark: '已发送初版报价，客户关注总价和辅料明细。',
      followUps: [
        { id: 'follow-1', date: today(), content: '发送报价单，说明石英砂和颗粒用量。', nextAction: '电话回访价格反馈' },
      ],
      quotes: [
        { id: 'quote-1', date: today(), title: '足球场报价', amount: 177177.5, status: '已发送' },
        { id: 'quote-2', date: daysAgo(1), title: '调整版报价', amount: 168800, status: '跟进中' },
      ],
    }),
    normalizeCustomer({
      id: 'customer-demo-2',
      date: daysAgo(4),
      name: '示例客户B',
      contact: '李总',
      phone: '13900000000',
      wechat: '',
      region: '河北',
      sourceAccount: '微信',
      dealAttribute: '中',
      customerAttribute: 'C端',
      projectType: '幼儿园草坪',
      scenario: '幼儿园活动区',
      intentLevel: 'C',
      area: 800,
      usageTime: '待确认',
      communication: '客户需要对比两种草高方案。',
      sampleSent: false,
      stage: 'follow',
      owner: '销售二部',
      assignedToUserId: 'owner',
      remark: '客户需要对比两种草高方案。',
      followUps: [],
      quotes: [
        { id: 'quote-3', date: daysAgo(4), title: '幼儿园草坪报价', amount: 32600, status: '已发送' },
      ],
    }),
  ]
}

function loadCustomers() {
  if (typeof localStorage === 'undefined')
    return defaultCustomers()
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved)
    return defaultCustomers()
  try {
    const parsed = JSON.parse(saved) as Partial<CrmCustomer>[]
    return Array.isArray(parsed) ? parsed.map(normalizeCustomer) : defaultCustomers()
  }
  catch {
    return defaultCustomers()
  }
}

export const useCrmStore = defineStore('crm', {
  state: () => ({
    customers: loadCustomers(),
  }),
  getters: {
    totals: state => ({
      customers: state.customers.length,
      quoted: state.customers.filter(customer => customer.stage === 'quoted').length,
      follow: state.customers.filter(customer => customer.stage === 'follow').length,
      won: state.customers.filter(customer => customer.stage === 'won').length,
      quoteAmount: state.customers.reduce((sum, customer) => sum + customer.quotes.reduce((inner, quote) => inner + quote.amount, 0), 0),
    }),
  },
  actions: {
    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.customers))
      putCloudState('customers', this.customers).catch(() => {})
    },
    async loadCloudCustomers() {
      const customers = await getCloudState<Partial<CrmCustomer>[]>('customers').catch(() => null)
      if (Array.isArray(customers)) {
        this.customers = customers.map(normalizeCustomer)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.customers))
      }
    },
    addCustomer(payload: Partial<CrmCustomer> = {}) {
      const customer = normalizeCustomer({
        id: createId('customer'),
        date: today(),
        name: '新客户',
        projectType: '足球场',
        scenario: '足球场',
        intentLevel: 'C',
        ...payload,
      })
      this.customers.unshift(customer)
      this.save()
      return customer.id
    },
    addLead(payload: Partial<CrmCustomer>) {
      return this.addCustomer({
        name: payload.name || payload.contact || payload.phone || payload.wechat || '未命名客户',
        contact: payload.contact || '',
        phone: payload.phone || '',
        wechat: payload.wechat || '',
        scenario: payload.scenario || '',
        sourceAccount: payload.sourceAccount || '',
        dealAttribute: payload.dealAttribute || '',
        customerAttribute: payload.customerAttribute || '',
        region: payload.region || '',
        area: Number(payload.area) || 0,
        usageTime: payload.usageTime || '',
        communication: payload.communication || '',
        sampleSent: Boolean(payload.sampleSent),
        sampleSpec: payload.sampleSpec || '',
        sampleTrackingNo: payload.sampleTrackingNo || '',
        projectType: payload.projectType || payload.scenario || '待确认',
        intentLevel: payload.intentLevel || 'C',
        assignedToUserId: payload.assignedToUserId || 'owner',
        owner: payload.owner || '',
        createdByUserId: payload.createdByUserId || 'owner',
        stage: 'new',
      })
    },
    removeCustomer(id: string) {
      this.customers = this.customers.filter(customer => customer.id !== id)
      this.save()
    },
    findCustomer(id: string) {
      return this.customers.find(customer => customer.id === id)
    },
    addFollowUp(customerId: string) {
      const customer = this.findCustomer(customerId)
      if (!customer)
        return
      customer.followUps.unshift({
        id: createId('follow'),
        date: today(),
        content: '新增跟进记录',
        nextAction: '',
        reminderDate: '',
        reminderTime: '',
        reminderDone: false,
      })
      this.save()
    },
    saveQuoteRecord(customerId: string, payload: Partial<CrmQuoteRecord> & { id?: string }) {
      const customer = this.findCustomer(customerId)
      if (!customer)
        return ''
      const id = payload.id || createId('quote')
      const existing = customer.quotes.find(quote => quote.id === id)
      const record: CrmQuoteRecord = {
        id,
        date: payload.date || today(),
        title: payload.title || '报价记录',
        amount: Number(payload.amount) || 0,
        status: payload.status || '已导出',
        isWon: Boolean(payload.isWon),
        dealAmount: Number(payload.dealAmount) || 0,
        dealDate: payload.dealDate || payload.date || today(),
        quoteFileName: payload.quoteFileName || existing?.quoteFileName || '',
        quoteFileDataUrl: payload.quoteFileDataUrl || existing?.quoteFileDataUrl || '',
        contractFileName: payload.contractFileName || '',
        contractFileDataUrl: payload.contractFileDataUrl || '',
      }
      if (existing)
        Object.assign(existing, record)
      else
        customer.quotes.unshift(record)
      if (customer.stage === 'new')
        customer.stage = 'quoted'
      this.save()
      return id
    },
  },
})
