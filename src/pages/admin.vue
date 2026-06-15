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
      <div class="admin-table user-admin-table">
        <div class="admin-head">
          <span>账号</span><span>姓名</span><span>角色</span><span>启用</span><span>产品管理</span><span>辅料管理</span><span>产品导入</span><span>账号管理</span><span>看全部客户</span><span>导入客户</span><span>导出客户</span><span>删除客户</span><span>回收站恢复</span><span>报价导出</span><span>临时改价</span><span>重置密码</span><span>操作</span>
        </div>
        <article v-for="user in users" :key="user.id">
          <input v-model="user.account">
          <input v-model="user.displayName">
          <select v-model="user.role" @change="applyUserRole(user)">
            <option value="owner">主账号</option>
            <option value="manager">管理员</option>
            <option value="quoter">报价员</option>
            <option value="viewer">只读</option>
          </select>
          <input v-model="user.enabled" type="checkbox">
          <input v-model="user.permissions.manageProducts" type="checkbox">
          <input v-model="user.permissions.manageMaterials" type="checkbox">
          <input v-model="user.permissions.importExcel" type="checkbox">
          <input v-model="user.permissions.manageUsers" type="checkbox">
          <input v-model="user.permissions.viewAllCustomers" type="checkbox" title="查看全部客户">
          <input v-model="user.permissions.importCustomers" type="checkbox" title="导入客户">
          <input v-model="user.permissions.exportCustomers" type="checkbox" title="导出客户">
          <input v-model="user.permissions.deleteCustomers" type="checkbox" title="删除客户">
          <input v-model="user.permissions.restoreRecords" type="checkbox" title="恢复回收站">
          <input v-model="user.permissions.exportQuote" type="checkbox">
          <input v-model="user.permissions.temporaryEdit" type="checkbox">
          <div class="reset-password-cell">
            <input v-model="resetPasswordDrafts[user.id]" type="password" placeholder="输入新密码">
            <button type="button" @click="resetAdminUserPassword(user)">重置</button>
          </div>
          <button :disabled="user.id === 'owner'" @click="removeAdminUser(user)">删除</button>
        </article>
      </div>
      <section class="permission-guide">
        <h3>权限说明</h3>
        <div class="permission-guide-table">
          <article v-for="item in permissionGuide" :key="item.field">
            <b>{{ item.group }}</b>
            <strong>{{ item.name }}</strong>
            <code>{{ item.field }}</code>
            <span>{{ item.detail }}</span>
          </article>
        </div>
      </section>
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
