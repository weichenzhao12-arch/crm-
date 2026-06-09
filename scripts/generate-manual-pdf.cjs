const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const manualPath = path.join(root, 'docs', 'CRM报价系统使用手册.md')
const htmlPath = path.join(root, 'docs', 'CRM报价系统使用手册-打印版.html')
const pdfPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Administrator', 'Desktop', 'CRM报价系统使用手册.pdf')
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

function esc(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function fmt(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

function table(lines, start) {
  const rows = []
  let i = start
  while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
    rows.push(lines[i].trim())
    i += 1
  }
  if (rows.length < 2)
    return { html: '', next: start + 1 }
  const cells = row => row.slice(1, -1).split('|').map(x => fmt(x.trim()))
  const head = cells(rows[0])
  const body = rows.slice(2).map(cells)
  return {
    next: i,
    html: `<table><thead><tr>${head.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${body.map(row => `<tr>${row.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`,
  }
}

function markdownToHtml(md) {
  const lines = md.replace(/^# .+\n/, '').split(/\r?\n/)
  const out = []
  let inList = false
  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }

  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim()
    if (!line) {
      closeList()
      i += 1
      continue
    }
    if (/^\|.*\|$/.test(line)) {
      closeList()
      const parsed = table(lines, i)
      out.push(parsed.html)
      i = parsed.next
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      closeList()
      const level = Math.min(heading[1].length + 1, 5)
      out.push(`<h${level}>${fmt(heading[2])}</h${level}>`)
      i += 1
      continue
    }
    const step = line.match(/^(\d+)\.\s+(.+)$/)
    if (step) {
      closeList()
      out.push(`<p class="step"><span>${step[1]}</span>${fmt(step[2])}</p>`)
      i += 1
      continue
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${fmt(bullet[1])}</li>`)
      i += 1
      continue
    }
    closeList()
    out.push(`<p>${fmt(line)}</p>`)
    i += 1
  }
  closeList()
  return out.join('\n')
}

function node(x, y, w, h, title, sub, fill) {
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="#2f6fce" stroke-width="1.4"/><text x="${x + w / 2}" y="${y + 30}" text-anchor="middle" font-size="16" font-weight="700" fill="#123a63">${title}</text><text x="${x + w / 2}" y="${y + 56}" text-anchor="middle" font-size="12" fill="#48627d">${sub}</text></g>`
}

function arrow(x1, y1, x2, y2, label = '') {
  const text = label ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle" font-size="12" fill="#1b4f91">${label}</text>` : ''
  return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#1d66d1" stroke-width="2" fill="none" marker-end="url(#arrow)"/>${text}`
}

function diagram(title, subtitle, content, viewBox = '0 0 960 420') {
  return `<section class="chapter"><h2>${title}</h2><p class="lead">${subtitle}</p><svg class="diagram" viewBox="${viewBox}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#1d66d1"/></marker></defs>${content}</svg></section>`
}

const diagrams = [
  diagram('系统架构总览', '前台负责操作，接口负责校验和保存，D1 保存业务数据，R2 保存图片和附件，Cloudflare Pages 负责对外访问。',
    node(40, 80, 180, 82, '使用人员', '老板 / 管理 / 销售', '#f2f8ff')
    + node(285, 45, 220, 82, 'CRM 报价系统前台', '登录、CRM、客户、报价、后台', '#e8f2ff')
    + node(585, 45, 220, 82, 'Hono 接口', '登录、数据读写、图片上传', '#eaf7f2')
    + node(585, 180, 220, 82, 'Cloudflare D1', '账号、客户、产品、报价状态', '#fff8df')
    + node(585, 310, 220, 82, 'Cloudflare R2', '产品图、辅料图、合同附件', '#fff0ee')
    + arrow(220, 121, 285, 86, '访问') + arrow(505, 86, 585, 86, '请求')
    + arrow(695, 127, 695, 180, '保存') + arrow(695, 127, 695, 310, '图片')),
  diagram('客户与报价业务流', '从新增客资到分配、跟进、报价、成交归档，每一步都有对应页面和权限控制。',
    node(35, 130, 135, 76, '新增客资', '单个/批量导入', '#f2f8ff')
    + node(210, 130, 135, 76, '分配客户', '选择销售人员', '#e8f2ff')
    + node(385, 130, 135, 76, '销售跟进', '记录/提醒/寄样', '#eaf7f2')
    + node(560, 130, 135, 76, '生成报价', '报价单/PDF', '#fff8df')
    + node(735, 130, 160, 76, '成交归档', '成交价/合同', '#fff0ee')
    + arrow(170, 168, 210, 168) + arrow(345, 168, 385, 168) + arrow(520, 168, 560, 168) + arrow(695, 168, 735, 168)),
  diagram('权限与数据可见范围', '主账号看全部并管理账号；管理员按勾选权限操作；普通销售默认只看自己的客户。',
    node(60, 75, 210, 86, '主账号', '全部客户、删除、账号权限', '#fff0ee')
    + node(375, 75, 210, 86, '管理员', '按授权管理产品/导入/导出', '#fff8df')
    + node(690, 75, 210, 86, '销售账号', '只看本人客户，可自改密码', '#e8f2ff')
    + node(60, 240, 210, 76, '全部客户数据', '老板视角', '#f7fbff')
    + node(375, 240, 210, 76, '授权功能', '后台勾选控制', '#f7fbff')
    + node(690, 240, 210, 76, '本人客户数据', '导入后默认归自己', '#f7fbff')
    + arrow(165, 161, 165, 240) + arrow(480, 161, 480, 240) + arrow(795, 161, 795, 240)),
  diagram('报价生成与价格逻辑', '产品支持阶梯价格、加针价格、辅料用量换算、运费施工按平方、PDF/Word 导出和客户报价记录保存。',
    node(45, 70, 170, 78, '选择产品', '阶梯价/图片/参数', '#e8f2ff')
    + node(275, 70, 170, 78, '设置加针', '后台默认，报价页可临时改', '#fff8df')
    + node(505, 70, 170, 78, '选择辅料', '套餐/图片/吨价', '#eaf7f2')
    + node(735, 70, 170, 78, '填写面积', '运费施工按平方', '#f2f8ff')
    + node(275, 245, 170, 78, '计算小计', '产品/辅料/税费/总价', '#fff0ee')
    + node(505, 245, 170, 78, '导出报价单', 'PDF / Word / 保存客户', '#f4efff')
    + arrow(215, 109, 275, 109) + arrow(445, 109, 505, 109) + arrow(675, 109, 735, 109) + arrow(820, 148, 360, 245, '计算') + arrow(445, 284, 505, 284)),
  diagram('数据同步与备份', '系统上线后，账号、客户、产品、价格等保存到 D1；图片和附件保存到 R2；代码和手册同步到 GitHub。',
    node(80, 105, 180, 78, '浏览器页面', '日常操作', '#f2f8ff')
    + node(380, 105, 180, 78, '接口服务', '校验账号和权限', '#eaf7f2')
    + node(675, 55, 180, 78, 'D1 数据库', '业务数据', '#fff8df')
    + node(675, 205, 180, 78, 'R2 图片库', '图片/合同', '#fff0ee')
    + arrow(260, 144, 380, 144, '保存/查询') + arrow(560, 128, 675, 94, '数据') + arrow(560, 158, 675, 244, '图片')),
].join('\n')

const md = fs.readFileSync(manualPath, 'utf8')
const body = markdownToHtml(md)
const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false })

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>CRM 报价系统使用手册</title><style>
@page{size:A4;margin:16mm 14mm}*{box-sizing:border-box}body{margin:0;color:#0f2742;font-family:"Microsoft YaHei","SimSun",Arial,sans-serif;font-size:12.5px;line-height:1.72;background:#fff}.cover{min-height:250mm;display:flex;flex-direction:column;justify-content:center;border:1px solid #c9d9ef;padding:38mm 22mm;background:linear-gradient(135deg,#f5f9ff 0%,#fff 60%);page-break-after:always}.eyebrow{color:#2367d5;font-weight:700;letter-spacing:.08em}h1{margin:14px 0 18px;font-size:34px;line-height:1.2;color:#102f52}.cover p{font-size:15px;color:#536a82;max-width:620px}.meta{margin-top:36px;display:grid;grid-template-columns:95px 1fr;gap:8px 16px;color:#29445f;font-size:13px}.chapter{page-break-inside:avoid;margin:0 0 18px;padding-bottom:8px}h2{margin:20px 0 10px;padding-left:10px;border-left:4px solid #2872df;font-size:21px;color:#113a66}h3{margin:16px 0 8px;font-size:16px;color:#143f6a}h4,h5{margin:12px 0 6px;font-size:14px;color:#174a7d}p{margin:5px 0}.lead{color:#536a82;font-size:13px;margin-bottom:10px}.diagram{width:100%;max-height:158mm;margin:8px 0 12px;border:1px solid #d7e4f3;border-radius:12px;background:#fbfdff}table{width:100%;border-collapse:collapse;margin:8px 0 12px;page-break-inside:avoid;font-size:11.2px}th{background:#dff5f1;color:#0f3358;font-weight:700}th,td{border:1px solid #a9d8d2;padding:5px 6px;vertical-align:top}ul{margin:5px 0 8px 18px;padding:0}li{margin:2px 0}code{padding:1px 4px;border-radius:4px;background:#eef5ff;color:#144f96;font-family:Consolas,monospace}.step{display:grid;grid-template-columns:22px 1fr;gap:8px;margin:4px 0}.step span{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#e8f2ff;color:#1d66d1;font-weight:700;font-size:11px}.manual-body{page-break-before:always}.manual-body h2{page-break-after:avoid}
</style></head><body><section class="cover"><div class="eyebrow">交接资料 / 使用说明 / 维护说明</div><h1>CRM 报价系统<br>详细使用手册</h1><p>用于交接系统日常使用、客户管理、报价生成、后台维护、账号权限、云端存储和后续维护事项。建议新账号培训时按本手册顺序演示一遍。</p><div class="meta"><strong>系统地址</strong><span>https://glass.neiceban.com/</span><strong>项目名称</strong><span>CRM 报价系统</span><strong>生成时间</strong><span>${generatedAt}</span><strong>适用对象</strong><span>主账号、管理员、销售人员、后续维护人员</span></div></section>${diagrams}<section class="manual-body">${body}</section></body></html>`

fs.writeFileSync(htmlPath, html, 'utf8')

if (!fs.existsSync(chromePath))
  throw new Error(`未找到 Chrome：${chromePath}`)

const result = spawnSync(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${pdfPath}`,
  `file:///${htmlPath.replace(/\\/g, '/')}`,
], { encoding: 'utf8' })

if (result.status !== 0)
  throw new Error(result.stderr || result.stdout || 'Chrome 导出失败')

console.log(JSON.stringify({ htmlPath, pdfPath }, null, 2))
