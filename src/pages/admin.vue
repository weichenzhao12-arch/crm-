<route lang="json">
{
  "meta": {
    "title": "管理后台",
    "layout": "default"
  }
}
</route>

<script setup lang="ts">
import * as XLSX from 'xlsx'
import { storeToRefs } from 'pinia'
import type { MaterialRecord, ProductRecord } from '~/features/quote/types'
import { uploadCloudImage } from '~/api/cloud-storage'
import { useAdminStore } from '~/stores/admin'
import { useCrmStore } from '~/stores/crm'
import { useQuoteStore } from '~/stores/quote'
import { useSystemStore } from '~/stores/system'
import type { RecycleRecord } from '~/stores/system'

const quote = useQuoteStore()
const admin = useAdminStore()
const crm = useCrmStore()
const system = useSystemStore()
const { pricing } = storeToRefs(quote)
const { users } = storeToRefs(admin)
const { activeRecycleBin, recentLogs } = storeToRefs(system)

const activeTab = ref<'products' | 'materials' | 'users' | 'recycle'>('products')
const keyword = ref('')
const oldPassword = ref('')
const newPassword = ref('')
const selectedProductIds = ref<string[]>([])
const selectedMaterialIds = ref<string[]>([])
const resetPasswordDrafts = ref<Record<string, string>>({})

watch(pricing, () => quote.savePricing(), { deep: true })

const permissionGuide = [
  { group: '商品资料', name: '产品管理', field: 'manageProducts', detail: '允许新增、修改、删除草坪产品、默认图片、价格和加针价格。' },
  { group: '商品资料', name: '辅料管理', field: 'manageMaterials', detail: '允许新增、修改、删除辅料、套餐辅料、默认图片和辅料价格。' },
  { group: '商品资料', name: '产品表格导入', field: 'importExcel', detail: '允许在后台批量导入产品价格表。' },
  { group: '账号权限', name: '账号管理', field: 'manageUsers', detail: '允许进入管理后台账号权限页，新增账号、修改角色和分配权限。' },
  { group: '客户管理', name: '查看全部客户', field: 'viewAllCustomers', detail: '允许看到所有销售的客户；未勾选时只能看到自己的客户。' },
  { group: '客户管理', name: '导入客户', field: 'importCustomers', detail: '允许导入客资表格。普通销售导入后客户归自己。' },
  { group: '客户管理', name: '导出客户', field: 'exportCustomers', detail: '允许导出客资表格；普通销售默认不允许导出。' },
  { group: '客户管理', name: '删除客户', field: 'deleteCustomers', detail: '允许删除单个或批量删除客户，删除后进入 7 天回收站。' },
  { group: '数据恢复', name: '回收站恢复', field: 'restoreRecords', detail: '允许从回收站恢复客户、产品、辅料，也可查看 7 天操作记录。' },
  { group: '报价', name: '报价导出', field: 'exportQuote', detail: '允许导出报价单 PDF/Word。' },
  { group: '报价', name: '临时改价', field: 'temporaryEdit', detail: '允许报价人员在报价页面临时修改单价，用于客户沟通。' },
]

onMounted(() => {
  quote.loadCloudPricing().then(() => {
    normalizeAllProductNeedleFields()
    quote.savePricing()
  })
  admin.loadCloudUsers()
  system.loadCloudSystemState()
})

const productColumns = ['货号', '产品类型', '产品名称', '草高', 'DTEX', '加针价格', '密度', '针排', '底布', '抗老化', '阶梯价格', '默认图片', '备注']

function normalizeProductValue(value: unknown) {
  return String(value ?? '').trim()
}

function isDensityValue(value: unknown) {
  const text = normalizeProductValue(value)
  return /(?:\d+(?:\.\d+)?\s*针|簇)/.test(text)
}

function isNeedleRowValue(value: unknown) {
  const text = normalizeProductValue(value).replace(/\s+/g, '')
  if (!text)
    return false

  if (/^\d+\s*\/\s*\d+$/.test(text))
    return true

  const numeric = Number(text)
  return Number.isFinite(numeric) && numeric >= 50
}

function mergeProductField(primary: string, secondary: string) {
  const values = [primary, secondary].map(value => value.trim()).filter(Boolean)
  return Array.from(new Set(values)).join(' ')
}

function normalizeNeedleFields(densityInput: unknown, needleRowInput: unknown) {
  let density = normalizeProductValue(densityInput)
  let needleRow = normalizeProductValue(needleRowInput)

  const densityLooksNeedleRow = isNeedleRowValue(density)
  const needleRowLooksDensity = isDensityValue(needleRow)

  if (densityLooksNeedleRow && needleRowLooksDensity) {
    const nextDensity = needleRow
    needleRow = density
    density = nextDensity
  }
  else {
    if (densityLooksNeedleRow) {
      needleRow = mergeProductField(needleRow, density)
      density = ''
    }

    if (needleRowLooksDensity) {
      density = mergeProductField(density, needleRow)
      needleRow = ''
    }
  }

  return { density, needleRow }
}

function normalizeProductNeedleFields(product: ProductRecord) {
  const normalized = normalizeNeedleFields(product.density, product.needleRow)
  product.density = normalized.density
  product.needleRow = normalized.needleRow
}

function normalizeAllProductNeedleFields() {
  pricing.value.products.forEach(normalizeProductNeedleFields)
}

const filteredProducts = computed(() => pricing.value.products.filter((product) => {
  const text = [product.itemNo, product.category, product.model, product.height, product.density, product.needleRow, product.poundWeight, product.priceText].join(' ').toLowerCase()
  return !keyword.value || text.includes(keyword.value.toLowerCase())
}))

const filteredMaterials = computed(() => pricing.value.materials
  .filter((material) => {
    const text = [material.category, material.name, material.spec, material.unit, material.note].join(' ').toLowerCase()
    return !keyword.value || text.includes(keyword.value.toLowerCase())
  })
  .slice()
  .sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN')
    || a.spec.localeCompare(b.spec, 'zh-CN')
    || a.category.localeCompare(b.category, 'zh-CN')
  ))

const allFilteredProductsSelected = computed(() => filteredProducts.value.length > 0 && filteredProducts.value.every(product => selectedProductIds.value.includes(product.id)))
const allFilteredMaterialsSelected = computed(() => filteredMaterials.value.length > 0 && filteredMaterials.value.every(material => selectedMaterialIds.value.includes(material.id)))

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function productToRow(product: ProductRecord) {
  return {
    货号: product.itemNo,
    产品类型: product.category,
    产品名称: product.model,
    草高: product.height,
    DTEX: product.poundWeight,
    加针价格: product.needlePrice,
    密度: product.density,
    针排: product.needleRow,
    底布: product.backing,
    抗老化: product.warranty,
    阶梯价格: product.priceText,
    默认图片: '',
    备注: product.note,
  }
}

function rowToProduct(row: Record<string, any>): ProductRecord {
  const normalized = normalizeNeedleFields(row.密度 || row.density || '', row.针排 || row.needleRow || '')

  return {
    id: createId('product'),
    category: String(row.产品类型 || row.category || ''),
    shippingFrom: '',
    itemNo: String(row.货号 || row.itemNo || ''),
    height: String(row.草高 || row.height || ''),
    model: String(row.产品名称 || row.model || ''),
    needleRow: normalized.needleRow,
    density: normalized.density,
    poundWeight: String(row.DTEX || row.dtex || row.磅重 || ''),
    backing: String(row.底布 || row.backing || ''),
    priceText: String(row.阶梯价格 || row.priceText || '0'),
    needlePrice: String(row.加针价格 || row.草丝 || row.needlePrice || ''),
    warranty: String(row.抗老化 || row.warranty || ''),
    note: String(row.备注 || row.note || ''),
    imageDataUrl: '',
  }
}

function uploadImage(event: Event, callback: (url: string) => void) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return

  uploadCloudImage(file)
    .then((result) => {
      callback(result.url)
      quote.savePricing()
      input.value = ''
    })
    .catch(() => {
      const reader = new FileReader()
      reader.onload = () => {
        callback(String(reader.result || ''))
        quote.savePricing()
        input.value = ''
      }
      reader.readAsDataURL(file)
    })
}

function clearProductImage(product: ProductRecord) {
  product.imageDataUrl = ''
  quote.savePricing()
}

function clearMaterialImage(material: MaterialRecord) {
  material.imageDataUrl = ''
  quote.savePricing()
}

function logProductPriceChange(product: ProductRecord, field = '价格') {
  system.log('update', 'pricing', product.itemNo || product.model || '产品', `修改产品${field}：${field === '加针价格' ? product.needlePrice : product.priceText}`)
}

function logMaterialPriceChange(material: MaterialRecord) {
  system.log('update', 'pricing', material.name || material.spec || '辅料', `修改辅料价格：${material.unitPrice}`)
}

function exportProductTemplate() {
  const rows = pricing.value.products.length
    ? pricing.value.products.map(productToRow)
    : [Object.fromEntries(productColumns.map(column => [column, '']))]
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: productColumns })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '产品模板')
  XLSX.writeFile(workbook, '产品标准导入模板.xlsx')
}

function importProductExcel(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return

  const reader = new FileReader()
  reader.onload = () => {
    const workbook = XLSX.read(reader.result, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet)
    const products = rows.map(rowToProduct).filter(product => product.itemNo || product.model)
    if (products.length) {
      pricing.value.products = products
      selectedProductIds.value = []
      system.log('import', 'pricing', `导入产品${products.length}条`, file.name)
      quote.savePricing()
    }
    input.value = ''
  }
  reader.readAsArrayBuffer(file)
}

function addProduct() {
  quote.addProductRecord('草坪产品')
  system.log('create', 'product', '新产品', '后台新增产品')
  quote.savePricing()
}

function addMaterial() {
  quote.addMaterialRecord('施工材料')
  system.log('create', 'material', '新辅料', '后台新增辅料')
  quote.savePricing()
}

function toggleAllProducts(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const ids = filteredProducts.value.map(product => product.id)
  selectedProductIds.value = checked
    ? Array.from(new Set([...selectedProductIds.value, ...ids]))
    : selectedProductIds.value.filter(id => !ids.includes(id))
}

function toggleAllMaterials(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  const ids = filteredMaterials.value.map(material => material.id)
  selectedMaterialIds.value = checked
    ? Array.from(new Set([...selectedMaterialIds.value, ...ids]))
    : selectedMaterialIds.value.filter(id => !ids.includes(id))
}

function deleteProducts(ids: string[]) {
  if (!ids.length)
    return
  ids.forEach(id => quote.removeProduct(id))
  system.log('delete', 'product', `${ids.length}个产品`, '后台删除产品')
  selectedProductIds.value = selectedProductIds.value.filter(id => !ids.includes(id))
  quote.savePricing()
}

function deleteMaterials(ids: string[]) {
  if (!ids.length)
    return
  ids.forEach(id => quote.removeMaterial(id))
  system.log('delete', 'material', `${ids.length}个辅料`, '后台删除辅料')
  selectedMaterialIds.value = selectedMaterialIds.value.filter(id => !ids.includes(id))
  quote.savePricing()
}

function restoreRecycleItem(record: RecycleRecord) {
  const item = system.restore(record.id)
  if (!item)
    return

  if (record.type === 'product')
    quote.restoreProduct(item)
  else if (record.type === 'material')
    quote.restoreMaterial(item)
  else if (record.type === 'customer')
    crm.restoreCustomer(item)
}

function recycleTypeLabel(type: string) {
  return type === 'product' ? '产品' : type === 'material' ? '辅料' : type === 'customer' ? '客户' : type === 'lead' ? '客资' : type
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    create: '新增',
    update: '修改',
    delete: '删除',
    restore: '恢复',
    'permanent-delete': '永久删除',
    import: '导入',
    transfer: '转移',
  }
  return labels[action] || action
}

function saveAll() {
  normalizeAllProductNeedleFields()
  quote.savePricing()
  admin.saveUsers()
}

function addAdminUser() {
  admin.addUser()
  const user = users.value[users.value.length - 1]
  system.log('create', 'user', user?.displayName || user?.account || '新账号', `新增账号：${user?.account || ''}`)
}

function applyUserRole(user: any) {
  admin.applyRole(user)
  system.log('update', 'user', user.displayName || user.account, `切换角色并重置权限：${user.role}`)
}

function removeAdminUser(user: any) {
  system.log('delete', 'user', user.displayName || user.account, `删除账号：${user.account}`)
  admin.removeUser(user.id)
}

function resetAdminUserPassword(user: any) {
  const nextPassword = resetPasswordDrafts.value[user.id]?.trim()
  if (!nextPassword) {
    window.alert('请输入要重置的新密码')
    return
  }
  if (!admin.resetUserPassword(user.id, nextPassword)) {
    window.alert('重置失败，请检查账号状态')
    return
  }
  resetPasswordDrafts.value[user.id] = ''
  system.log('update', 'user', user.displayName || user.account, `重置账号密码：${user.account}`)
  window.alert('密码已重置')
}

function changeOwnPassword() {
  if (!admin.updateOwnPassword(oldPassword.value, newPassword.value)) {
    window.alert('原密码不正确，或新密码为空')
    return
  }
  system.log('update', 'user', admin.currentUser?.displayName || admin.currentUser?.account || '当前账号', '当前账号修改了自己的密码')
  oldPassword.value = ''
  newPassword.value = ''
  window.alert('密码已修改')
}
</script>

<template>
  <main class="admin-page">
    <section class="admin-hero">
      <div>
        <p>管理后台</p>
        <h1>报价系统后台</h1>
      </div>
      <nav>
        <RouterLink to="/crm">CRM</RouterLink>
        <RouterLink to="/quote">返回报价</RouterLink>
        <button @click="saveAll">保存后台数据</button>
      </nav>
    </section>

    <section class="admin-tabs">
      <button :class="{ active: activeTab === 'products' }" @click="activeTab = 'products'">产品管理</button>
      <button :class="{ active: activeTab === 'materials' }" @click="activeTab = 'materials'">辅料管理</button>
      <button :class="{ active: activeTab === 'users' }" @click="activeTab = 'users'">账号权限</button>
      <button :class="{ active: activeTab === 'recycle' }" @click="activeTab = 'recycle'">回收站/记录</button>
    </section>

    <section v-if="activeTab === 'products'" class="admin-panel">
      <header>
        <h2>产品管理</h2>
        <div class="admin-actions">
          <button @click="addProduct">新增产品</button>
          <button @click="exportProductTemplate">导出标准表格</button>
          <label>导入产品<input type="file" accept=".xlsx,.xls" @change="importProductExcel"></label>
          <button :disabled="!selectedProductIds.length" class="danger" @click="deleteProducts(selectedProductIds)">批量删除</button>
        </div>
      </header>
      <input v-model="keyword" class="admin-search" placeholder="搜索货号、类型、名称、草高、密度、针排、价格">
      <div class="admin-table product-admin-table">
        <div class="admin-head">
          <input type="checkbox" :checked="allFilteredProductsSelected" @change="toggleAllProducts">
          <span>货号</span><span>类型</span><span>名称</span><span>草高</span><span>DTEX</span><span>加针价格</span><span>密度</span><span>针排</span><span>底布</span><span>抗老化</span><span>阶梯价格</span><span>图片</span><span>备注</span><span>操作</span>
        </div>
        <article v-for="product in filteredProducts" :key="product.id">
          <input v-model="selectedProductIds" type="checkbox" :value="product.id">
          <input v-model="product.itemNo">
          <input v-model="product.category">
          <input v-model="product.model">
          <input v-model="product.height">
          <input v-model="product.poundWeight">
          <input v-model="product.needlePrice" @blur="logProductPriceChange(product, '加针价格')">
          <input v-model="product.density" @blur="normalizeProductNeedleFields(product)">
          <input v-model="product.needleRow" @blur="normalizeProductNeedleFields(product)">
          <input v-model="product.backing">
          <input v-model="product.warranty">
          <textarea v-model="product.priceText" @blur="logProductPriceChange(product)"></textarea>
          <div class="image-admin-cell">
            <img v-if="product.imageDataUrl" :src="product.imageDataUrl" alt="">
            <label class="image-upload">{{ product.imageDataUrl ? '更换' : '上传' }}<input type="file" accept="image/*" @change="uploadImage($event, url => product.imageDataUrl = url)"></label>
            <button v-if="product.imageDataUrl" type="button" @click="clearProductImage(product)">清除</button>
          </div>
          <input v-model="product.note">
          <button class="danger" @click="deleteProducts([product.id])">删除</button>
        </article>
      </div>
    </section>

    <section v-else-if="activeTab === 'materials'" class="admin-panel">
      <header>
        <h2>辅料管理</h2>
        <div class="admin-actions">
          <button @click="addMaterial">新增辅料</button>
          <button :disabled="!selectedMaterialIds.length" class="danger" @click="deleteMaterials(selectedMaterialIds)">批量删除</button>
        </div>
      </header>
      <input v-model="keyword" class="admin-search" placeholder="搜索辅料">
      <div class="admin-table material-admin-table">
        <div class="admin-head">
          <input type="checkbox" :checked="allFilteredMaterialsSelected" @change="toggleAllMaterials">
          <span>类型</span><span>名称</span><span>规格</span><span>单位</span><span>单价</span><span>备注</span><span>操作</span>
        </div>
        <article v-for="material in filteredMaterials" :key="material.id">
          <input v-model="selectedMaterialIds" type="checkbox" :value="material.id">
          <input v-model="material.category">
          <input v-model="material.name">
          <input v-model="material.spec">
          <input v-model="material.unit">
          <input v-model.number="material.unitPrice" type="number" step="0.01" @blur="logMaterialPriceChange(material)">
          <div class="image-admin-cell">
            <img v-if="material.imageDataUrl" :src="material.imageDataUrl" alt="">
            <label class="image-upload">{{ material.imageDataUrl ? '更换' : '上传' }}<input type="file" accept="image/*" @change="uploadImage($event, url => material.imageDataUrl = url)"></label>
            <button v-if="material.imageDataUrl" type="button" @click="clearMaterialImage(material)">清除</button>
          </div>
          <input v-model="material.note">
          <button class="danger" @click="deleteMaterials([material.id])">删除</button>
        </article>
      </div>
    </section>

    <section v-else-if="activeTab === 'users'" class="admin-panel">
      <header>
        <h2>账号权限</h2>
        <button @click="addAdminUser">新增账号</button>
      </header>
      <div class="password-box">
        <label>原密码<input v-model="oldPassword" type="password" placeholder="输入当前密码"></label>
        <label>当前账号修改密码<input v-model="newPassword" type="password" placeholder="输入新密码"></label>
        <button @click="changeOwnPassword">修改密码</button>
      </div>
      <div class="user-cards">
        <article v-for="user in users" :key="user.id" class="user-permission-card">
          <header>
            <div class="user-card-title"><i>{{ user.displayName.slice(0, 1) || '用' }}</i><div><b>{{ user.displayName || user.account }}</b><span>{{ user.account }}</span></div></div>
            <label class="account-enabled"><input v-model="user.enabled" type="checkbox" @change="admin.saveUsers()">账号启用</label>
          </header>
          <div class="account-fields">
            <label>登录账号<input v-model="user.account" @blur="admin.saveUsers()"></label>
            <label>显示姓名<input v-model="user.displayName" @blur="admin.saveUsers()"></label>
            <label>角色模板
              <select v-model="user.role" @change="applyUserRole(user)">
                <option value="owner">主账号</option>
                <option value="manager">管理员</option>
                <option value="quoter">报价员</option>
                <option value="viewer">只读</option>
              </select>
            </label>
          </div>
          <div class="permission-groups">
            <section>
              <h3>客户与数据</h3>
              <label><input v-model="user.permissions.viewAllCustomers" type="checkbox" @change="admin.saveUsers()"><span><b>查看全部客户与团队统计</b><small>关闭时，客户、今日跟进和数据统计都只显示本人数据</small></span></label>
              <label><input v-model="user.permissions.importCustomers" type="checkbox" @change="admin.saveUsers()"><span><b>导入客户</b><small>允许通过 Excel 批量导入客资</small></span></label>
              <label><input v-model="user.permissions.exportCustomers" type="checkbox" @change="admin.saveUsers()"><span><b>导出客户</b><small>允许下载可见范围内的客户数据</small></span></label>
              <label><input v-model="user.permissions.deleteCustomers" type="checkbox" @change="admin.saveUsers()"><span><b>删除客户</b><small>允许单个或批量移入回收站</small></span></label>
            </section>
            <section>
              <h3>报价与商品</h3>
              <label><input v-model="user.permissions.exportQuote" type="checkbox" @change="admin.saveUsers()"><span><b>报价导出</b><small>允许导出报价单 PDF / Word</small></span></label>
              <label><input v-model="user.permissions.temporaryEdit" type="checkbox" @change="admin.saveUsers()"><span><b>临时改价</b><small>允许在报价时临时调整单价</small></span></label>
              <label><input v-model="user.permissions.manageProducts" type="checkbox" @change="admin.saveUsers()"><span><b>产品管理</b><small>新增、修改和删除产品</small></span></label>
              <label><input v-model="user.permissions.manageMaterials" type="checkbox" @change="admin.saveUsers()"><span><b>辅料管理</b><small>新增、修改和删除辅料</small></span></label>
              <label><input v-model="user.permissions.importExcel" type="checkbox" @change="admin.saveUsers()"><span><b>产品表格导入</b><small>批量导入产品价格表</small></span></label>
            </section>
            <section>
              <h3>系统管理</h3>
              <label><input v-model="user.permissions.manageUsers" type="checkbox" @change="admin.saveUsers()"><span><b>账号与权限管理</b><small>允许新增账号、调整角色和权限</small></span></label>
              <label><input v-model="user.permissions.restoreRecords" type="checkbox" @change="admin.saveUsers()"><span><b>回收站恢复</b><small>恢复已删除记录并查看操作日志</small></span></label>
              <div class="reset-password-cell">
                <input v-model="resetPasswordDrafts[user.id]" type="password" placeholder="输入新密码">
                <button type="button" @click="resetAdminUserPassword(user)">重置密码</button>
              </div>
              <button class="delete-account" :disabled="user.id === 'owner'" @click="removeAdminUser(user)">删除账号</button>
            </section>
          </div>
        </article>
      </div>
      <details class="permission-guide">
        <summary>查看完整权限字段说明</summary>
        <div class="permission-guide-table">
          <article v-for="item in permissionGuide" :key="item.field">
            <b>{{ item.group }}</b>
            <strong>{{ item.name }}</strong>
            <code>{{ item.field }}</code>
            <span>{{ item.detail }}</span>
          </article>
        </div>
      </details>
    </section>

    <section v-else class="admin-panel">
      <header>
        <h2>回收站 / 操作记录</h2>
        <p class="admin-hint">只保留最近 7 天，超过 7 天自动清理。</p>
      </header>
      <div class="recycle-layout">
        <section>
          <h3>回收站</h3>
          <div v-if="activeRecycleBin.length" class="record-list">
            <article v-for="record in activeRecycleBin" :key="record.id" class="record-card">
              <div>
                <b>{{ recycleTypeLabel(record.type) }}：{{ record.name }}</b>
                <span>{{ record.deletedBy }} 删除于 {{ record.deletedAt.slice(0, 10) }}</span>
              </div>
              <div>
                <button @click="restoreRecycleItem(record)">恢复</button>
                <button class="danger" @click="system.permanentDelete(record.id)">永久删除</button>
              </div>
            </article>
          </div>
          <div v-else class="empty-state">暂无回收内容</div>
        </section>
        <section>
          <h3>操作记录</h3>
          <div v-if="recentLogs.length" class="record-list">
            <article v-for="log in recentLogs" :key="log.id" class="record-card">
              <div>
                <b>{{ log.actor }} {{ actionLabel(log.action) }} {{ recycleTypeLabel(log.type) }}：{{ log.name }}</b>
                <span>{{ log.createdAt.slice(0, 19).replace('T', ' ') }} {{ log.detail }}</span>
              </div>
            </article>
          </div>
          <div v-else class="empty-state">暂无操作记录</div>
        </section>
      </div>
    </section>
  </main>
</template>

<style scoped>
.admin-page{min-height:100vh;background:#eef3f8;padding:24px;color:#142235}
.admin-hero{display:flex;align-items:center;justify-content:space-between;gap:18px;max-width:1680px;margin:0 auto 18px;padding:24px;border-radius:18px;background:linear-gradient(135deg,#10243f,#1f5f8b);color:#fff}
.admin-hero p{margin:0 0 6px;color:#cce5ff;font-weight:800}
.admin-hero h1{margin:0;font-size:34px}
.admin-hero nav,.admin-actions,.admin-tabs{display:flex;flex-wrap:wrap;gap:10px}
.admin-hero a,.admin-hero button,.admin-tabs button,.admin-panel button,.admin-actions label{min-height:40px;border:1px solid #cfe0f3;border-radius:10px;background:#fff;color:#183f68;padding:9px 14px;font-weight:800;text-decoration:none;cursor:pointer}
.admin-panel button.danger,.admin-actions button.danger{border-color:#f1b7b7;color:#a42b2b;background:#fff7f7}
.admin-panel button:disabled{opacity:.45;cursor:not-allowed}
.admin-tabs{max-width:1680px;margin:0 auto 14px}
.admin-tabs button.active{background:#246ed8;color:#fff;border-color:#246ed8}
.admin-panel{max-width:1680px;margin:0 auto 18px;padding:20px;border:1px solid #d7e2ee;border-radius:16px;background:#fff;box-shadow:0 12px 34px rgba(38,59,84,.075)}
.admin-panel header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
.admin-panel h2{margin:0;font-size:22px}
.admin-actions input{display:none}
.admin-search{width:100%;min-height:42px;margin-bottom:12px;border:1px solid #d5dee9;border-radius:10px;padding:9px 12px}
.admin-table{overflow:auto;border:1px solid #e1e9f2;border-radius:12px}
.admin-head,.admin-table article{display:grid;gap:8px;align-items:center;min-width:1260px;padding:10px;border-bottom:1px solid #e1e9f2}
.admin-head{background:#f5f8fc;color:#50627a;font-size:12px;font-weight:900}
.admin-table article:last-child{border-bottom:0}
.product-admin-table .admin-head,.product-admin-table article{grid-template-columns:36px 118px 104px 128px 76px 84px 86px 90px 80px 112px 88px 150px 96px 120px 96px;min-width:1518px}
.material-admin-table .admin-head,.material-admin-table article{grid-template-columns:36px 140px 150px 1fr 92px 110px 150px 220px 70px}
.user-admin-table .admin-head,.user-admin-table article{grid-template-columns:96px 96px 96px 52px repeat(11,82px) minmax(150px,1fr) 64px;min-width:1506px;gap:6px;padding:8px}
.user-admin-table .admin-head{font-size:11px}
.user-admin-table article input,
.user-admin-table article select{min-height:32px;padding:5px 7px;font-size:13px}
.user-admin-table article input[type="checkbox"]{width:16px;height:16px}
.user-admin-table article input:nth-last-of-type(1){width:100%}
.user-admin-table article button{min-height:32px;padding:5px 8px;font-size:12px}
.reset-password-cell{display:grid;grid-template-columns:minmax(120px,1fr) 52px;gap:6px;align-items:center}
.reset-password-cell input{width:100%}
.admin-table input,.admin-table select,.admin-table textarea,.password-box input{min-width:0;min-height:36px;border:1px solid #d5dee9;border-radius:8px;background:#f8fafc;padding:7px 9px}
.admin-table input[type="checkbox"]{width:18px;height:18px;min-height:0;justify-self:center}
.admin-table textarea{min-height:38px;resize:vertical}
.image-admin-cell{display:flex;align-items:center;gap:6px;min-width:0}
.image-admin-cell img{width:38px;height:38px;border:1px solid #d5dee9;border-radius:8px;object-fit:cover;background:#f8fafc}
.image-upload{display:inline-flex;align-items:center;justify-content:center;min-height:34px;border:1px dashed #91bdf5;border-radius:8px;background:#f4f9ff;color:#246ed8;padding:6px 9px;font-size:12px;font-weight:900;cursor:pointer}
.image-upload input{display:none}
.image-admin-cell button{min-height:34px;padding:6px 9px;font-size:12px}
.password-box{display:flex;align-items:end;gap:10px;margin-bottom:14px;padding:12px;border:1px solid #e1e9f2;border-radius:12px;background:#f8fbff}
.password-box label{display:grid;gap:6px;min-width:260px;font-weight:800;color:#50627a}
.admin-hint{margin:0;color:#64748b;font-weight:800}
.permission-guide{margin-top:18px;border:1px solid #e1e9f2;border-radius:12px;background:#fbfdff;padding:14px}
.permission-guide h3{margin:0 0 12px;font-size:18px}
.permission-guide-table{display:grid;gap:8px}
.permission-guide-table article{display:grid;grid-template-columns:90px 120px 140px minmax(0,1fr);gap:10px;align-items:center;border:1px solid #e1e9f2;border-radius:10px;background:#fff;padding:10px}
.permission-guide-table b{color:#246ed8}
.permission-guide-table code{border-radius:7px;background:#eef4fb;padding:5px 7px;color:#183f68}
.permission-guide-table span{color:#50627a;line-height:1.5}
.recycle-layout{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.recycle-layout h3{margin:0 0 10px;font-size:18px}
.record-list{display:grid;gap:10px}
.record-card{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #dce7f3;border-radius:12px;background:#f8fbff}
.record-card div:first-child{display:grid;gap:4px}
.record-card b{color:#10243f}
.record-card span{color:#64748b;font-size:13px;font-weight:800}
.record-card div:last-child{display:flex;gap:8px;flex-wrap:wrap}
.empty-state{padding:22px;border:1px dashed #b8cce3;border-radius:12px;background:#f8fbff;color:#64748b;text-align:center;font-weight:900}
@media(max-width:720px){
  .admin-page{padding:10px 10px 76px}
  .admin-hero{align-items:flex-start;flex-direction:column;padding:16px;border-radius:14px}
  .admin-hero h1{font-size:24px}
  .admin-hero nav,.admin-actions,.admin-tabs{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .admin-hero a,.admin-hero button,.admin-tabs button,.admin-panel button,.admin-actions label{width:100%;min-height:42px;padding:8px 10px;text-align:center}
  .admin-panel{padding:12px;border-radius:14px}
  .admin-panel header{align-items:flex-start;flex-direction:column}
  .admin-search{min-height:42px}
  .admin-table{display:grid;gap:10px;border:0;background:transparent;overflow:visible}
  .admin-head{display:none}
  .admin-table article,
  .product-admin-table article,
  .material-admin-table article,
  .user-admin-table article{
    display:grid;
    grid-template-columns:1fr;
    min-width:0;
    gap:8px;
    border:1px solid #dbe6f2;
    border-radius:14px;
    background:#fff;
    padding:12px;
  }
  .admin-table input,.admin-table select,.admin-table textarea{width:100%;min-height:40px}
  .admin-table input[type="checkbox"]{width:20px}
  .image-admin-cell{display:grid;grid-template-columns:auto 1fr auto;width:100%}
  .image-upload{width:100%}
  .password-box{display:grid;grid-template-columns:1fr;align-items:stretch}
  .password-box label{min-width:0}
  .recycle-layout{grid-template-columns:1fr}
  .record-card{align-items:flex-start;flex-direction:column}
  .user-admin-table article input:nth-last-of-type(1){width:100%}
}
</style>

<style scoped>
.permission-guide summary{cursor:pointer;color:#2563eb;font-size:12px;font-weight:800}.permission-guide[open] summary{margin-bottom:12px}
</style>

<style scoped>
.admin-page{min-height:calc(100vh - 64px);max-width:1600px;margin:auto;background:#f5f7fa;padding:24px 28px 32px}.admin-hero{max-width:none;margin:0 0 14px;padding:0;background:transparent;color:#172033;border-radius:0}.admin-hero p{margin:0 0 6px;color:#172033;font-size:25px;font-weight:900}.admin-hero h1{color:#64748b;font-size:13px;font-weight:500}.admin-hero nav a,.admin-hero nav button{min-height:38px;border:1px solid #d9e2ec;border-radius:9px;background:#fff;color:#344255;padding:0 13px;font-size:12px;box-shadow:none}.admin-tabs{max-width:none;margin-bottom:14px;padding:5px;border:1px solid #e2e8f0;border-radius:11px;background:#fff}.admin-tabs button{min-height:36px;border:0;border-radius:8px;padding:0 14px;font-size:12px}.admin-tabs button.active{background:#2563eb}.admin-panel{max-width:none;border-color:#e2e8f0;border-radius:12px;box-shadow:0 3px 12px rgba(15,42,67,.035)}.user-cards{display:grid;gap:14px}.user-permission-card{overflow:hidden;border:1px solid #e2e8f0;border-radius:12px;background:#fff}.user-permission-card>header{display:flex!important;min-height:64px;align-items:center!important;margin:0!important;border-bottom:1px solid #edf1f5;padding:12px 16px}.user-card-title{display:flex;align-items:center;gap:10px}.user-card-title i{display:grid;width:38px;height:38px;place-items:center;border-radius:10px;background:#eff6ff;color:#2563eb;font-style:normal;font-weight:900}.user-card-title b,.user-card-title span{display:block}.user-card-title b{font-size:14px}.user-card-title span{margin-top:4px;color:#94a3b8;font-size:10px}.account-enabled{display:flex;align-items:center;gap:7px;color:#526579;font-size:11px;font-weight:800}.account-enabled input{width:16px;height:16px}.account-fields{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;border-bottom:1px solid #edf1f5;background:#fbfdff;padding:14px 16px}.account-fields label{display:grid;gap:6px;color:#64748b;font-size:10px;font-weight:800}.account-fields input,.account-fields select{height:36px;border:1px solid #dce4ec;border-radius:8px;background:#fff;padding:0 10px;color:#172033;font-size:12px}.permission-groups{display:grid;grid-template-columns:1.15fr 1.15fr 1fr;gap:0}.permission-groups>section{padding:15px 16px;border-right:1px solid #edf1f5}.permission-groups>section:last-child{border:0}.permission-groups h3{margin:0 0 10px;color:#334155;font-size:12px}.permission-groups label{display:grid;grid-template-columns:18px 1fr;align-items:start;gap:8px;border-radius:8px;padding:8px 7px;cursor:pointer}.permission-groups label:hover{background:#f8fafc}.permission-groups label input{width:16px;height:16px;margin-top:2px}.permission-groups label b,.permission-groups label small{display:block}.permission-groups label b{color:#334155;font-size:11px}.permission-groups label small{margin-top:3px;color:#94a3b8;font-size:9px;line-height:1.45;font-weight:500}.permission-groups .reset-password-cell{display:grid;grid-template-columns:1fr auto;margin-top:8px}.permission-groups .reset-password-cell input{height:34px;border:1px solid #dce4ec;border-radius:7px;padding:0 9px}.permission-groups .reset-password-cell button{min-height:34px;border-radius:7px;padding:0 9px;font-size:10px}.delete-account{width:100%;min-height:34px!important;margin-top:8px;border-color:#fecaca!important;background:#fff!important;color:#dc2626!important;font-size:10px!important}.permission-guide{margin-top:14px}.permission-guide-table article{grid-template-columns:82px 130px 140px minmax(0,1fr);font-size:11px}.password-box{border-color:#e2e8f0;background:#f8fafc}.password-box label{font-size:11px}
@media(max-width:1000px){.permission-groups{grid-template-columns:1fr 1fr}.permission-groups>section:nth-child(2){border-right:0}.permission-groups>section:last-child{grid-column:1/-1;border-top:1px solid #edf1f5}.account-fields{grid-template-columns:1fr 1fr}}
@media(max-width:720px){.admin-page{min-height:calc(100vh - 56px);padding:16px 12px 24px}.admin-hero p{font-size:22px}.admin-tabs{display:flex;overflow:auto;flex-wrap:nowrap}.admin-tabs button{width:auto!important;white-space:nowrap}.password-box{display:grid}.password-box label{min-width:0}.account-fields,.permission-groups{grid-template-columns:1fr}.permission-groups>section{border-right:0;border-bottom:1px solid #edf1f5}.permission-groups>section:last-child{grid-column:auto}.permission-guide-table article{grid-template-columns:1fr}.permission-guide-table code{overflow:auto}}
</style>
