import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const cwd = process.cwd()
const presetName = process.argv[2]

if (!presetName) {
  console.error('Usage: pnpm preset:apply <preset-name>')
  process.exit(1)
}

const presetDir = path.join(cwd, 'presets', presetName)
const metaPath = path.join(presetDir, 'meta.json')

if (!fs.existsSync(metaPath)) {
  console.error(`Preset "${presetName}" not found.`)
  process.exit(1)
}

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
console.log(`Preset "${presetName}" scaffold found.`)
console.log(`Description: ${meta.description}`)
console.log('v1 note: manual merge only. Use preset files as source material.')
