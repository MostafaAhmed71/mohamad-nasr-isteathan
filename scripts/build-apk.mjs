import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'

function loadEnv() {
  const envPath = join(root, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    const val = m[2].trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const home = process.env.HOME || ''
const studioJbrWin = 'C:\\Program Files\\Android\\Android Studio\\jbr'
const jdkCandidates = [
  process.env.JAVA_HOME,
  studioJbrWin,
  home && join(home, 'development/android-studio/jbr'),
  home && join(home, 'android-studio/jbr'),
  home && join(home, '.local/jdk-17'),
  '/usr/lib/jvm/java-21-openjdk-amd64',
  '/usr/lib/jvm/java-17-openjdk-amd64',
].filter(Boolean)

const sdkCandidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
  process.env.USERPROFILE && join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'Sdk'),
  home && join(home, 'Android', 'Sdk'),
].filter(Boolean)

function firstExisting(paths) {
  return paths.find((p) => p && existsSync(p))
}

const javaHome = firstExisting(jdkCandidates)
const androidHome = firstExisting(sdkCandidates)

if (!javaHome) {
  console.error('JDK not found. Install Android Studio (uses its bundled JBR) or set JAVA_HOME.')
  process.exit(1)
}
if (!androidHome) {
  console.error('Android SDK not found. Install Android Studio SDK or set ANDROID_HOME.')
  process.exit(1)
}

process.env.JAVA_HOME = javaHome
process.env.ANDROID_HOME = androidHome
process.env.ANDROID_SDK_ROOT = androidHome
process.env.PATH = [
  join(javaHome, 'bin'),
  join(androidHome, 'platform-tools'),
  process.env.PATH,
].join(isWin ? ';' : ':')

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: isWin,
      env: process.env,
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
  })
}

const release = process.argv.includes('--release')
const shouldInstall = process.argv.includes('--install')
const androidDir = join(root, 'android')
const gradle = isWin ? 'gradlew.bat' : './gradlew'
const outDir = join(root, 'apk')
const builtApk = release
  ? join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
  : join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
const destApk = join(outDir, release ? 'khurooj-release.apk' : 'khurooj-debug.apk')

function bumpVersionCode() {
  const gradlePath = join(androidDir, 'app', 'build.gradle')
  const text = readFileSync(gradlePath, 'utf8')
  const match = text.match(/versionCode\s+(\d+)/)
  const nameMatch = text.match(/versionName\s+"([^"]+)"/)
  if (!match) {
    console.warn('versionCode not found in android/app/build.gradle — skipped bump.')
    return null
  }
  const next = Number(match[1]) + 1
  writeFileSync(gradlePath, text.replace(/versionCode\s+\d+/, `versionCode ${next}`))
  console.log(`versionCode ${match[1]} → ${next} (required for in-place Android update)`)
  return {
    versionCode: next,
    versionName: nameMatch?.[1] ?? String(next),
  }
}

function writeUpdateManifest(version) {
  const base = String(process.env.APP_UPDATE_BASE_URL ?? process.env.VITE_APP_UPDATE_BASE_URL ?? '').replace(
    /\/$/,
    '',
  )
  const apkUrl =
    String(process.env.APP_UPDATE_APK_URL ?? '').trim() ||
    (base ? `${base}/apk/khurooj-release.apk` : 'https://YOUR-DOMAIN/apk/khurooj-release.apk')

  const manifest = {
    versionCode: version.versionCode,
    versionName: version.versionName,
    apkUrl,
    notes: 'تحديث تلقائي من الخادم',
  }

  const json = `${JSON.stringify(manifest, null, 2)}\n`
  const publicPath = join(root, 'public', 'app-version.json')
  const apkDirPath = join(root, 'apk', 'app-version.json')
  writeFileSync(publicPath, json, 'utf8')
  mkdirSync(join(root, 'apk'), { recursive: true })
  writeFileSync(apkDirPath, json, 'utf8')
  console.log(`Wrote app-version.json (versionCode ${version.versionCode})`)
  if (!base) {
    console.warn(
      'Set APP_UPDATE_BASE_URL in .env to your site URL so devices download the correct APK.',
    )
  }
}

async function installOnDevice(apkPath) {
  const adb = join(androidHome, 'platform-tools', isWin ? 'adb.exe' : 'adb')
  if (!existsSync(adb)) {
    console.warn('adb not found. Copy the APK to the tablet and open it — Android will update the app.')
    return
  }
  try {
    await run(adb, ['install', '-r', apkPath])
    console.log('Installed over the existing app (no uninstall).')
  } catch {
    console.warn(
      'Could not install via USB. Copy the APK onto the device and open it.\n' +
        'If Android refuses, the installed copy was signed with a different key — uninstall once, then future updates overlay.',
    )
  }
}

if (!existsSync(androidDir)) {
  console.error('android/ is missing. Run: npx cap add android')
  process.exit(1)
}

if (!existsSync(join(androidDir, 'keystore.properties'))) {
  console.log('No keystore yet — creating permanent release key...')
  await run(process.execPath, [join(root, 'scripts', 'setup-android-keystore.mjs')])
}

const version = bumpVersionCode()
if (version) writeUpdateManifest(version)

const linuxRoot = !isWin
  ? process.env.ISTEATHAN_LINUX_DIR || join(home, 'work', 'isteathan')
  : root
const buildRoot = !isWin && existsSync(join(linuxRoot, 'package.json')) ? linuxRoot : root
const buildAndroidDir = join(buildRoot, 'android')
const builtApkOnBuildRoot = release
  ? join(buildAndroidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
  : join(buildAndroidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')

// On Linux /mnt/E (NTFS noexec): web build via run.mjs → ~/work/isteathan
if (!isWin) {
  await run(process.execPath, [join(root, 'scripts', 'run.mjs'), 'vite:build'])
  // Keep signing key available in the Linux work copy (rsync excludes it).
  mkdirSync(join(buildAndroidDir, 'keystore'), { recursive: true })
  for (const name of ['keystore.properties', 'keystore/khurooj-release.jks']) {
    const from = join(androidDir, name)
    const to = join(buildAndroidDir, name)
    if (existsSync(from)) {
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(from, to)
    }
  }
  await run('npx', ['cap', 'sync', 'android'], buildRoot)
  const gradleBin = join(buildAndroidDir, gradle)
  try {
    const { chmodSync } = await import('node:fs')
    chmodSync(gradleBin, 0o755)
  } catch {
    // ignore chmod failures
  }
  await run(gradleBin, [release ? 'assembleRelease' : 'assembleDebug'], buildAndroidDir)
} else {
  await run('npm.cmd', ['run', 'vite:build'])
  await run('npx.cmd', ['cap', 'sync', 'android'])
  await run(join(androidDir, gradle), [release ? 'assembleRelease' : 'assembleDebug'], androidDir)
}

mkdirSync(outDir, { recursive: true })
const apkSource = existsSync(builtApkOnBuildRoot) ? builtApkOnBuildRoot : builtApk
copyFileSync(apkSource, destApk)
console.log(`\nAPK ready (${release ? 'release' : 'debug'}):\n  ${destApk}\n`)
console.log('Install over the existing app (same signature). Do not uninstall.\n')

if (shouldInstall) {
  await installOnDevice(destApk)
}
