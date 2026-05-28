<route lang="json">
{
  "meta": {
    "title": "登录",
    "layout": "blank",
    "guestOnly": true
  }
}
</route>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'

const route = useRoute()
const router = useRouter()
const { login } = useAuth()
const account = ref('')
const password = ref('')
const errorMessage = ref('')
const nextPath = computed(() => {
  const redirect = route.query.redirect
  return typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/'
})

async function handleLogin() {
  errorMessage.value = ''
  const result = await login(account.value, password.value)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  await router.push(nextPath.value)
}
</script>

<template>
  <main class="login-page">
    <section class="login-card">
      <div>
        <p>CRM 报价系统</p>
        <h1>账号登录</h1>
        <span>请输入后台创建的账号和密码</span>
      </div>

      <form @submit.prevent="handleLogin">
        <label>
          账号
          <input v-model="account" autocomplete="off" placeholder="请输入账号">
        </label>
        <label>
          密码
          <input v-model="password" autocomplete="new-password" placeholder="请输入密码" type="password">
        </label>
        <strong v-if="errorMessage">{{ errorMessage }}</strong>
        <button type="submit">登录系统</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login-page{min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#eef6ff,#f8fbff);padding:24px;color:#142235}
.login-card{width:min(440px,100%);border:1px solid #d7e2ee;border-radius:20px;background:#fff;padding:30px;box-shadow:0 24px 70px rgba(38,59,84,.14)}
.login-card p{margin:0 0 8px;color:#246ed8;font-weight:900}
.login-card h1{margin:0;color:#10243f;font-size:32px}
.login-card span{display:block;margin-top:8px;color:#64748b}
form{display:grid;gap:14px;margin-top:26px}
label{display:grid;gap:8px;color:#183f68;font-weight:900}
input{min-height:44px;border:1px solid #cfdceb;border-radius:12px;background:#f8fbff;padding:10px 12px;color:#142235;font-size:15px}
strong{color:#d92929;font-size:14px}
button{min-height:46px;border:0;border-radius:12px;background:#246ed8;color:#fff;font-size:16px;font-weight:900;cursor:pointer;box-shadow:0 12px 24px rgba(36,110,216,.22)}
</style>
