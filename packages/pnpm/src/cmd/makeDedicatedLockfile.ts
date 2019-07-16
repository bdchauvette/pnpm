import { getLockfileImporterId, readWantedLockfile, writeWantedLockfile, Lockfile } from '@pnpm/lockfile-file'
import { pruneSharedLockfile } from '@pnpm/prune-lockfile'
import { PnpmOptions } from '../types'

export default async function installCmd (
  input: string[],
  opts: PnpmOptions,
) {
  if (!opts.lockfileDirectory) return
  const lockfile = await readWantedLockfile(opts.lockfileDirectory, { ignoreIncompatible: false })
  if (!lockfile) return
  const currentImporterId = getLockfileImporterId(opts.lockfileDirectory, opts.prefix)
  const dedicatedLockfile: Lockfile = pruneSharedLockfile({
    importers: {
      [currentImporterId]: lockfile.importers[currentImporterId],
    },
    packages: lockfile.packages,
    lockfileVersion: lockfile.lockfileVersion,
  })

  await writeWantedLockfile(opts.prefix, dedicatedLockfile)
}
