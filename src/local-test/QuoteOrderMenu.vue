<template>
  <main class="order-menu">
    <h1>报价</h1>
    <nav aria-label="报价类型">
      <RouterLink to="/quote?view=quote">场地报价</RouterLink>
      <RouterLink to="/quote/b2b">普通报价</RouterLink>
    </nav>
  </main>
</template>

<style scoped>
.order-menu{box-sizing:border-box;min-height:calc(100dvh - 64px);display:grid;grid-template-rows:minmax(48px,1fr) auto minmax(48px,1fr);justify-items:center;padding:24px;color:var(--crm-text)}
h1{margin:0;font-size:24px;font-weight:700;justify-self:start;align-self:start}
nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;width:min(100%,620px)}
a{display:grid;place-items:center;min-height:144px;padding:16px;border-radius:8px;background:var(--crm-blue-dark);box-shadow:var(--crm-shadow);color:#fff;font-size:22px;font-weight:700;text-align:center;text-decoration:none}
a:hover{background:#1059ac}
a:focus-visible{outline:3px solid var(--crm-blue-dark);outline-offset:4px}
@media(max-width:520px){
  nav{grid-template-columns:minmax(0,1fr);max-width:340px;gap:12px}
  a{min-height:104px;font-size:20px}
}
</style>
