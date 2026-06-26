import { execSync } from 'child_process'
import { readFileSync, renameSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
const version = pkg.version

// Build
console.log('Building...')
execSync('npm run build', { stdio: 'inherit', cwd: root })

// Zip dist
const distDir = resolve(root, 'dist')
const zipName = `utools-clipper-v${version}.zip`
const zipPath = join(distDir, zipName)
console.log(`Packaging ${zipName}...`)
execSync(`npx bestzip "${zipName}" .`, { stdio: 'inherit', cwd: distDir })

// Move zip to root
const destPath = resolve(root, zipName)
renameSync(zipPath, destPath)
console.log(`Done: ${zipName}`)
