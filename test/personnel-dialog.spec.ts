import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { webcrypto } from 'node:crypto'
import { TextEncoder } from 'node:util'
import { expect, it, vi } from 'vitest'
import PersonHandoffDialog from '../src/features/personnel/PersonHandoffDialog.vue'
import { apiFetch } from '../src/api/cloud-storage'
vi.mock('../src/api/cloud-storage', () => ({ apiFetch: vi.fn() }))

it('previews an even distribution to multiple people and submits explicit customer mappings', async () => {
  setActivePinia(createPinia())
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('TextEncoder', TextEncoder)
  const old = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
  const oldClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { value: vi.fn(), configurable: true })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { value: vi.fn(), configurable: true })
  const api = vi.mocked(apiFetch)
  api.mockResolvedValueOnce({ source: { id: 'source', name: '原销售', revision: 'source-rev' }, customers: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, name: `客户${i}`, revision: `r${i}`, reminders: 1 })), targets: [{ id: 'a', name: '接手甲', revision: 'ra' }, { id: 'b', name: '接手乙', revision: 'rb' }], departments: [], openOrders: [], ordersRevision: 'orders-rev' }).mockResolvedValue({ ok: true })
  const page = mount(PersonHandoffDialog, { props: { sourceId: 'source', mode: 'leave' }, global: { stubs: { Teleport: true } } })
  const button = (text: string) => page.findAll('button').find(button => button.text() === text)!
  try {
    await flushPromises()
    await page.get('input[required]').setValue('离职分配')
    await page.get('select').setValue('even')
    for (const checkbox of page.findAll('.ph-targets input[type=checkbox]')) await checkbox.setValue(true)
    await button('预览交接').trigger('click')
    expect(page.text()).toContain('接手甲：3 位客户')
    expect(page.text()).toContain('接手乙：2 位客户')
    expect(api).toHaveBeenCalledTimes(1)
    await button('确认交接').trigger('click')
    await flushPromises()
    const payload = JSON.parse(String(api.mock.calls[1]![1]!.body))
    expect(payload.assignments.map((item: { toUserId: string }) => item.toUserId)).toEqual(['a', 'b', 'a', 'b', 'a'])
    expect(payload.assignments[0]).toEqual({ id: 'c0', revision: 'r0', toUserId: 'a', targetRevision: 'ra' })
    expect(page.emitted('completed')).toHaveLength(1)
  }
  finally {
    page.unmount(); api.mockReset(); sessionStorage.clear(); vi.unstubAllGlobals()
    if (old) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', old); else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    if (oldClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', oldClose); else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  }
})
