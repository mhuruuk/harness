import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error The repair script intentionally ships as plain .mjs.
import * as repairNodeGypLto from './repair-node-gyp-lto.mjs'

interface RepairResult {
  readonly source: string
  readonly patched: number
}

const {
  REPAIR_MARKER,
  repairLtoSource,
  resolveGypiPath,
} = repairNodeGypLto as {
  REPAIR_MARKER: string
  repairLtoSource: (source: string) => RepairResult
  resolveGypiPath: (env?: NodeJS.ProcessEnv, platform?: string, nodeVersion?: string) => string
}

const script = fileURLToPath(new URL('./repair-node-gyp-lto.mjs', import.meta.url))

// Mirrors the Node 26.7.0 common.gypi LTO section: one non-MSVC enable_lto
// cflags block plus the three Windows msvs_settings blocks.
const unpatchedSource = [
  "      ['OS==\"win\"', {",
  "        'conditions': [",
  "          ['enable_lto==\"true\"', {",
  "            'cflags': ['<(lto)'],",
  "            'ldflags': ['<(lto)'],",
  '          }],',
  "          ['enable_lto==\"true\"', {",
  "            'msvs_settings': {",
  "              'VCCLCompilerTool': {",
  "                'AdditionalOptions': ['-flto=full'],",
  '              },',
  '            },',
  '          },]',
  "          ['enable_thin_lto==\"true\"', {",
  "            'msvs_settings': {",
  "              'VCCLCompilerTool': {",
  "                'AdditionalOptions': ['-flto=thin'],",
  '              },',
  '            },',
  '          },]',
  "          ['(enable_thin_lto==\"true\" or enable_lto==\"true\") and lto_jobs!=\"\"', {",
  "            'msvs_settings': {",
  "              'VCLinkerTool': {",
  "                'AdditionalOptions': ['/opt:lldltojobs=<(lto_jobs)'],",
  '              },',
  '            },',
  '          },]',
  '        ],',
  '      },],',
  '',
].join('\n')

const ltoFreeSource = [
  "      ['OS==\"win\"', {",
  "        'conditions': [",
  "          ['enable_lto==\"true\"', {",
  "            'cflags': ['<(lto)'],",
  '          }],',
  '        ],',
  '      },],',
  '',
].join('\n')

const containers: string[] = []

function fixture(name: string, content: string): string {
  const container = mkdtempSync(join(tmpdir(), 'dsh-repair-node-gyp-lto-'))
  containers.push(container)
  const path = join(container, name)
  writeFileSync(path, content)
  return path
}

function runScript(env: NodeJS.ProcessEnv): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env })
  return { status: result.status, stderr: result.stderr, stdout: result.stdout }
}

afterEach(() => {
  for (const container of containers.splice(0)) rmSync(container, { force: true, recursive: true })
})

describe('repairLtoSource', () => {
  it('disables the three MSVC LTO blocks and leaves the non-MSVC LTO block intact', () => {
    const { source, patched } = repairLtoSource(unpatchedSource)

    expect(patched).toBe(3)
    expect(source.match(/\['1==0', \{/g)).toHaveLength(3)
    expect(source.match(/'enable_lto=="true"'/g)).toHaveLength(1)
    expect(source).not.toMatch(/'enable_thin_lto=="true"', \{\r?\n[ \t]*'msvs_settings'/)
    expect(source).toContain("'-flto=full'")
    expect(source).toContain("'-flto=thin'")
    expect(source).toContain('/opt:lldltojobs=<(lto_jobs)')
    expect(source).toContain(REPAIR_MARKER)
  })

  it('is idempotent on an already repaired source', () => {
    const first = repairLtoSource(unpatchedSource)
    const second = repairLtoSource(first.source)

    expect(second.patched).toBe(0)
    expect(second.source).toBe(first.source)
  })

  it('leaves a cache without MSVC LTO blocks untouched', () => {
    const { source, patched } = repairLtoSource(ltoFreeSource)

    expect(patched).toBe(0)
    expect(source).toBe(ltoFreeSource)
  })

  it('repairs CRLF sources and preserves their line endings', () => {
    const crlf = unpatchedSource.replaceAll('\n', '\r\n')
    const { source, patched } = repairLtoSource(crlf)

    expect(patched).toBe(3)
    expect(source.match(/\['1==0', \{/g)).toHaveLength(3)
    expect(source).not.toMatch(/\['1==0', \{\n/)
    expect(source).toContain(`${REPAIR_MARKER}: the three MSVC LTO condition blocks below are disabled.\r\n`)
  })
})

describe('resolveGypiPath', () => {
  it('resolves the Windows cache under LOCALAPPDATA', () => {
    expect(
      resolveGypiPath({ LOCALAPPDATA: 'C:/Users/u/AppData/Local' }, 'win32', '26.7.0'),
    ).toBe(join('C:/Users/u/AppData/Local', 'node-gyp', 'Cache', '26.7.0', 'include', 'node', 'common.gypi'))
  })

  it('resolves the POSIX cache under HOME', () => {
    expect(
      resolveGypiPath({ HOME: '/home/u' }, 'linux', '26.7.0'),
    ).toBe(join('/home/u', '.node-gyp', '26.7.0', 'include', 'node', 'common.gypi'))
  })
})

describe('repair-node-gyp-lto CLI', () => {
  it('repairs an explicit common.gypi, backs it up, and reports a second run as done', () => {
    const gypi = fixture('common.gypi', unpatchedSource)
    const original = readFileSync(gypi, 'utf8')
    const env = { ...process.env, DSH_NODE_GYP_GYPI: gypi }

    const first = runScript(env)
    expect(first.status, first.stderr).toBe(0)
    expect(readFileSync(gypi, 'utf8')).toContain(REPAIR_MARKER)
    expect(existsSync(`${gypi}.bak`)).toBe(true)
    expect(readFileSync(`${gypi}.bak`, 'utf8')).toBe(original)

    const repaired = readFileSync(gypi, 'utf8')
    const second = runScript(env)
    expect(second.status, second.stderr).toBe(0)
    expect(second.stdout).toContain('already repaired')
    expect(readFileSync(gypi, 'utf8')).toBe(repaired)
  })

  it('fails loudly when the explicit common.gypi is missing', () => {
    const missing = join(tmpdir(), 'dsh-repair-node-gyp-lto-missing', 'common.gypi')
    const result = runScript({ ...process.env, DSH_NODE_GYP_GYPI: missing })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('explicit common.gypi not found')
  })

  it('fails loudly when the explicit common.gypi has no recognizable LTO blocks', () => {
    const gypi = fixture('common.gypi', ltoFreeSource)
    const result = runScript({ ...process.env, DSH_NODE_GYP_GYPI: gypi })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('cache layout is unrecognized')
    expect(readFileSync(gypi, 'utf8')).toBe(ltoFreeSource)
    expect(existsSync(`${gypi}.bak`)).toBe(false)
  })

  it('accepts a cache whose LTO blocks are already disabled without the marker', () => {
    const alreadyDisabled = repairLtoSource(unpatchedSource).source.replaceAll(
      `# ${REPAIR_MARKER}:`,
      '# some-other-repair:',
    )
    const gypi = fixture('common.gypi', alreadyDisabled)

    const result = runScript({ ...process.env, DSH_NODE_GYP_GYPI: gypi })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('already disabled')
    expect(readFileSync(gypi, 'utf8')).toBe(alreadyDisabled)
    expect(existsSync(`${gypi}.bak`)).toBe(false)
  })
})
