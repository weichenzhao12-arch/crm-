import { mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import CustomerPicker from '../src/features/warehouse/CustomerPicker.vue'

it('opens a separate searchable selector and only binds on confirmation', async () => {
  const oldShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
  const oldClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
  const show = vi.fn()
  const close = vi.fn()
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { value: show, configurable: true })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { value: close, configurable: true })
  const picker = mount(CustomerPicker, { props: { modelValue: '', customerId: '', options: [
    { id: 'a', name: '同名客户', phone: '111' }, { id: 'b', name: '同名客户', phone: '222' },
  ] } })
  try {
    await picker.get('button').trigger('click')
    expect(show).toHaveBeenCalled()
    await picker.get('input[type=search]').setValue('222')
    expect(picker.findAll('input[type=radio]')).toHaveLength(1)
    await picker.get('input[type=radio]').setValue(true)
    expect(picker.emitted('select')).toBeUndefined()
    await picker.findAll('button').find(button => button.text() === '确认选择')!.trigger('click')
    expect(picker.emitted('select')![0]![0]).toEqual({ id: 'b', name: '同名客户', phone: '222' })
    expect(close).toHaveBeenCalled()
    await picker.get('input[autocomplete=off]').setValue('临时收货人')
    expect(picker.emitted('update:modelValue')![0]).toEqual(['临时收货人'])
  }
  finally {
    picker.unmount()
    if (oldShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', oldShow)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    if (oldClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', oldClose)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
  }
})
