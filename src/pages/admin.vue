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
import { useQuoteStore } from '~/stores/quote'

const quote = useQuoteStore()
const admin = useAdminStore()
const { pricing } = storeToRefs(quote)
const { users } = storeToRefs(admin)

const activeTab = ref<'products' | 'materials' | 'users'>('products')
const keyword = ref('')
const newPassword = ref('')
const selectedProductIds = ref<string[]>([])
const selectedMaterialIds = ref<string[]>([])
const showUserPasswords = ref(false)

watch(pricing, () => quote.savePricing(), { deep: true })

onMounted(() => {
  quote.loadCloudPricing()
  admin.loadCloudUsers()
})

const productColumns = ['货号', '产品类型', '产品名称', '草高', 'DTEX', '草丝', '密度', '针排', '底布', '抗老化', '阶梯价格', '默认图片', '备注']

const filteredProducts = computed(() => pricing.value.products.filter((product) => {
  const text = [product.itemNo, product.category, product.model, product.height, product.density, product.poundWeight, product.priceText].join(' ').toLowerCase()
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
    草丝: product.needlePrice,
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
  return {
    id: createId('product'),
    category: String(row.产品类型 || row.category || ''),
    shippingFrom: '',
    itemNo: String(row.货号 || row.itemNo || ''),
    height: String(row.草高 || row.height || ''),
    model: String(row.产品名称 || row.model || ''),
    needleRow: String(row.针排 || row.needleRow || ''),
    density: String(row.密度 || row.density || ''),
    poundWeight: String(row.DTEX || row.dtex || row.磅重 || ''),
    backing: String(row.底布 || row.backing || ''),
    priceText: String(row.阶梯价格 || row.priceText || '0'),
    needlePrice: String(row.草丝 || row.needlePrice || ''),
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
      quote.savePricing()
    }
    input.value = ''
  }
  reader.readAsArrayBuffer(file)
}

function addProduct() {
  quote.addProductRecord('草坪产品')
  quote.savePricing()
}

function addMaterial() {
  quote.addMaterialRecord('施工材料')
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
  pricing.value.products = pricing.value.products.filter(product => !ids.includes(product.id))
  selectedProductIds.value = selectedProductIds.value.filter(id => !ids.includes(id))
  quote.savePricing()
}

function deleteMaterials(ids: string[]) {
  if (!ids.length)
    return
  pricing.value.materials = pricing.value.materials.filter(material => !ids.includes(material.id))
  selectedMaterialIds.value = selectedMaterialIds.value.filter(id => !ids.includes(id))
  quote.savePricing()
}

function saveAll() {
  quote.savePricing()
  admin.saveUsers()
}

function changeOwnPassword() {
  admin.updateOwnPassword(newPassword.value)
  newPassword.value = ''
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
      <input v-model="keyword" class="admin-search" placeholder="搜索货号、类型、名称、草高、密度、价格">
      <div class="admin-table product-admin-table">
        <div class="admin-head">
          <input type="checkbox" :checked="allFilteredProductsSelected" @change="toggleAllProducts">
          <span>货号</span><span>类型</span><span>名称</span><span>草高</span><span>DTEX</span><span>草丝</span><span>密度</span><span>针排</span><span>底布</span><span>抗老化</span><span>阶梯价格</span><span>备注</span><span>操作</span>
        </div>
        <article v-for="product in filteredProducts" :key="product.id">
          <input v-model="selectedProductIds" type="checkbox" :value="product.id">
          <input v-model="product.itemNo">
          <input v-model="product.category">
          <input v-model="product.model">
          <input v-model="product.height">
          <input v-model="product.poundWeight">
          <input v-model="product.needlePrice">
          <input v-model="product.density">
          <input v-model="product.needleRow">
          <input v-model="product.backing">
          <input v-model="product.warranty">
          <textarea v-model="product.priceText"></textarea>
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
          <input v-model.number="material.unitPrice" type="number" step="0.01">
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

    <section v-else class="admin-panel">
      <header>
        <h2>账号权限</h2>
        <button @click="admin.addUser()">新增账号</button>
      </header>
      <div class="password-box">
        <label>当前账号修改密码<input v-model="newPassword" type="password" placeholder="输入新密码"></label>
        <button @click="changeOwnPassword">修改密码</button>
      </div>
      <div class="admin-table user-admin-table">
        <div class="admin-head">
          <span>账号</span><span>姓名</span><span>角色</span><span>启用</span><span>产品</span><span>辅料</span><span>导入</span><span>用户</span><span>导出</span><span>临时改价</span>
          <button class="password-toggle" type="button" @click="showUserPasswords = !showUserPasswords">{{ showUserPasswords ? '隐藏密码' : '显示密码' }}</button><span></span>
        </div>
        <article v-for="user in users" :key="user.id">
          <input v-model="user.account">
          <input v-model="user.displayName">
          <select v-model="user.role" @change="admin.applyRole(user)">
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
          <input v-model="user.permissions.exportQuote" type="checkbox">
          <input v-model="user.permissions.temporaryEdit" type="checkbox">
          <input v-model="user.password" :type="showUserPasswords ? 'text' : 'password'">
          <button :disabled="user.id === 'owner'" @click="admin.removeUser(user.id)">删除</button>
        </article>
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
.admin-head .password-toggle{min-height:28px;border-color:#bcd4f0;border-radius:7px;background:#eef6ff;color:#1f5f9d;padding:4px 8px;font-size:12px}
.admin-table article:last-child{border-bottom:0}
.product-admin-table .admin-head,.product-admin-table article{grid-template-columns:36px 120px 110px 130px 82px 92px 82px 92px 82px 120px 92px 180px 150px 140px 70px}
.material-admin-table .admin-head,.material-admin-table article{grid-template-columns:36px 140px 150px 1fr 92px 110px 150px 220px 70px}
.user-admin-table .admin-head,.user-admin-table article{grid-template-columns:110px 110px 110px repeat(7,70px) 110px 70px}
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
</style>
