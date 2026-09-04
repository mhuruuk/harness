// Repair the node-gyp header cache for Node builds that leak clang LTO config.
//
// Node 26+ ships a clang + thin-LTO build, and node-gyp 12+ seeds the generated
// config.gypi from process.config. Its enable_thin_lto/lto_jobs values then
// satisfy the LTO conditions in the cached common.gypi, so MSVC addon builds
// receive clang-only flags (-flto=thin, /opt:lldltojobs=N) that cl.exe and
// link.exe reject (LNK1117).
//
// This script disables the three Windows LTO condition blocks in the cached
// common.gypi (their bodies stay, inert). It is idempotent: a marker comment
// records the repair, and common.gypi.bak preserves the original.
//
// Usage:
//   node scripts/repair-node-gyp-lto.mjs
//       Auto-locate the current Node's cache. Exits 0 without touching anything
//       when the platform or Node build cannot be affected.
//   DSH_NODE_GYP_GYPI=<path> node scripts/repair-node-gyp-lto.mjs
//       Repair an explicit common.gypi (used by the spec and for foreign caches).

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Marker token written into a repaired common.gypi; its presence means "done". */
export const REPAIR_MARKER = 'dsh-repair-node-gyp-lto'

// The three Windows LTO condition blocks. Each pattern is anchored to the
// following 'msvs_settings' line, so the non-MSVC enable_lto cflags block is
// never touched. Indentation and line endings are matched, not assumed.
const FULL_LTO = /([ \t]*)\['enable_lto=="true"', \{(\r?\n)([ \t]*)'msvs_settings': \{/
const THIN_LTO = /([ \t]*)\['enable_thin_lto=="true"', \{(\r?\n)([ \t]*)'msvs_settings': \{/
const LTO_JOBS = /([ \t]*)\['\(enable_thin_lto=="true" or enable_lto=="true"\) and lto_jobs!=""', \{(\r?\n)([ \t]*)'msvs_settings': \{/
const PATCHED_BLOCK = /\n([ \t]*)\['1==0', \{(\r?\n)([ \t]*)'msvs_settings': \{/

/**
 * Disable the Windows MSVC LTO condition blocks in a common.gypi source.
 * @param source - the full common.gypi text.
 * @returns the repaired source and how many blocks were disabled; an already
 *   repaired or LTO-free source comes back unchanged with `patched: 0`.
 */
export function repairLtoSource(source) {
  if (source.includes(REPAIR_MARKER)) return { source, patched: 0 }
  let out = source
  let patched = 0
  for (const pattern of [FULL_LTO, THIN_LTO, LTO_JOBS]) {
    const match = pattern.exec(out)
    if (match === null) continue
    const [indent, newline, innerIndent] = [match[1], match[2], match[3]]
    out = out.replace(pattern, () => `${indent}['1==0', {${newline}${innerIndent}'msvs_settings': {`)
    patched++
  }
  if (patched === 0) return { source, patched: 0 }
  const first = PATCHED_BLOCK.exec(out)
  if (first !== null) {
    const indent = first[1]
    const eol = out.includes('\r\n') ? '\r\n' : '\n'
    const marker = [
      `${indent}# ${REPAIR_MARKER}: the three MSVC LTO condition blocks below are disabled.`,
      `${indent}# Node 26+ is a clang+LTO build; node-gyp leaks its LTO config into`,
      `${indent}# MSVC addon builds and link.exe rejects the flags (LNK1117).`,
      `${indent}# Restore from common.gypi.bak or delete the node-gyp cache to undo.`,
    ].join(eol)
    out = `${out.slice(0, first.index + 1)}${marker}${eol}${out.slice(first.index + 1)}`
  }
  return { source: out, patched }
}

/**
 * Resolve the cached common.gypi node-gyp uses for a Node version.
 * @param env - environment providing LOCALAPPDATA (win32) or HOME (POSIX).
 * @param platform - the Node platform.
 * @param nodeVersion - the Node version whose cache is wanted.
 * @returns the absolute common.gypi path.
 */
export function resolveGypiPath(env = process.env, platform = process.platform, nodeVersion = process.versions.node) {
  const base = platform === 'win32'
    ? join(env.LOCALAPPDATA ?? '', 'node-gyp', 'Cache', nodeVersion)
    : join(env.HOME ?? env.USERPROFILE ?? '', '.node-gyp', nodeVersion)
  return join(base, 'include', 'node', 'common.gypi')
}

function fail(message) {
  console.error(`repair-node-gyp-lto: ${message}`)
  process.exit(1)
}

function repairFile(gypiPath, original, { strict }) {
  if (original.includes(REPAIR_MARKER)) {
    console.log(`already repaired: ${gypiPath}`)
    return
  }
  const { source, patched } = repairLtoSource(original)
  if (patched > 0) {
    const backupPath = `${gypiPath}.bak`
    if (!existsSync(backupPath)) copyFileSync(gypiPath, backupPath)
    writeFileSync(gypiPath, source)
    console.log(`repaired ${patched} LTO block(s) in ${gypiPath} (backup: ${backupPath})`)
    return
  }
  if (/flto|lldltojobs/.test(original)) {
    console.log(`already disabled: ${gypiPath}`)
    return
  }
  if (strict) fail(`no LTO condition blocks found in ${gypiPath}; the cache layout is unrecognized`)
  console.log(`no LTO condition blocks found in ${gypiPath}; nothing to repair`)
}

function main() {
  const explicitPath = process.env.DSH_NODE_GYP_GYPI?.trim()
  if (explicitPath !== undefined && explicitPath !== '') {
    if (!existsSync(explicitPath)) fail(`explicit common.gypi not found: ${explicitPath}`)
    repairFile(explicitPath, readFileSync(explicitPath, 'utf8'), { strict: true })
    return
  }
  if (process.platform !== 'win32') {
    console.log('not needed: the LTO/MSVC conflict is Windows-only')
    return
  }
  const variables = process.config.variables
  if (!variables.enable_lto && !variables.enable_thin_lto) {
    console.log('not needed: this Node build does not leak LTO config into node-gyp')
    return
  }
  const gypiPath = resolveGypiPath()
  if (!existsSync(gypiPath)) {
    console.log(`node-gyp cache for Node ${process.versions.node} not found at ${gypiPath}`)
    console.log('It is created on the first native build. Re-run this script after that build fails.')
    return
  }
  repairFile(gypiPath, readFileSync(gypiPath, 'utf8'), { strict: false })
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
