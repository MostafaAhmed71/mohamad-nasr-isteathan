#!/usr/bin/env node
/**
 * Create a permanent release keystore (once). Debug + release builds both use it
 * so APK updates install over the existing app without uninstall.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const androidDir = join(root, 'android')
const keystoreDir = join(androidDir, 'keystore')
const keystoreFile = join(keystoreDir, 'khurooj-release.jks')
const propsFile = join(androidDir, 'keystore.properties')

const home = process.env.HOME || ''
const keytoolCandidates = [
  process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin', 'keytool'),
  join(home, 'development/android-studio/jbr/bin/keytool'),
  join(home, 'android-studio/jbr/bin/keytool'),
  '/usr/lib/jvm/java-21-openjdk-amd64/bin/keytool',
  '/usr/lib/jvm/java-17-openjdk-amd64/bin/keytool',
  'keytool',
].filter(Boolean)

const keytool = keytoolCandidates.find((p) => p === 'keytool' || existsSync(p))
if (!keytool) {
  console.error('keytool not found. Install JDK or Android Studio.')
  process.exit(1)
}

if (existsSync(keystoreFile) && existsSync(propsFile)) {
  console.log('Keystore already exists:', keystoreFile)
  process.exit(0)
}

mkdirSync(keystoreDir, { recursive: true })

const password = randomBytes(12).toString('base64url')
const dname =
  'CN=Khurooj Elite North Schools, OU=IT, O=Elite North Schools, L=Riyadh, ST=Riyadh, C=SA'

const args = [
  '-genkeypair',
  '-v',
  '-storetype',
  'JKS',
  '-keyalg',
  'RSA',
  '-keysize',
  '2048',
  '-validity',
  '10000',
  '-alias',
  'khurooj',
  '-keystore',
  keystoreFile,
  '-storepass',
  password,
  '-keypass',
  password,
  '-dname',
  dname,
]

const result = spawnSync(keytool, args, { stdio: 'inherit' })
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const props = `storeFile=keystore/khurooj-release.jks
storePassword=${password}
keyAlias=khurooj
keyPassword=${password}
`
writeFileSync(propsFile, props, 'utf8')

console.log('\nCreated release keystore:')
console.log(' ', keystoreFile)
console.log(' ', propsFile)
console.log('\nاحفظ نسخة احتياطية من المجلد android/keystore/ وملف keystore.properties.')
console.log('بدونهما لن تتمكن من تحديث التطبيق على الأجهزة دون حذف النسخة القديمة.\n')
