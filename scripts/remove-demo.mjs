import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const cwd = process.cwd()

const targets = [
  'src/pages/login.vue',
  'src/pages/demo-api.vue',
  'src/api/modules/demo.ts',
]

for (const target of targets) {
  const absolutePath = path.join(cwd, target)
  if (fs.existsSync(absolutePath))
    fs.rmSync(absolutePath, { force: true })
}

console.log('Removed demo files. Update navigation and route references before build if you keep layout links unchanged.')
