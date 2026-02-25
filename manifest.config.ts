import { defineManifest } from '@crxjs/vite-plugin'
import packageJson from './package.json'

const { version } = packageJson

// Convert from Semver (e.g. 0.1.0-beta6)
const [major, minor, patch] = version.replace(/[^\d.-]+/g, '').split(/[.-]/)

export default defineManifest(async (env) => ({
  manifest_version: 3,
  name: env.mode === 'staging' ? '[INTERNAL] QKnot' : 'QKnot',
  version: `${major}.${minor}.${patch}`,
  version_name: version,
  action: {
    default_popup: 'index.html',
    default_icon: {
      "16": "icon-16.png",
      "48": "icon-48.png",
      "128": "icon-128.png"
    }
  },
  icons: {
    "16": "icon-16.png",
    "48": "icon-48.png",
    "128": "icon-128.png"
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: ['storage', 'alarms', 'contextMenus'],
  host_permissions: ['http://*/*', 'https://*/*']
}))
