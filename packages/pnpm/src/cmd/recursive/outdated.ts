import { getLockfileImporterId } from '@pnpm/lockfile-file'
import { OutdatedPackage } from '@pnpm/outdated'
import { DependenciesField, PackageJson, Registries } from '@pnpm/types'
import R = require('ramda')
import { table } from 'table'
import wrapAnsi = require('wrap-ansi')
import {
  getCellWidth,
  outdatedDependenciesOfWorkspacePackages,
  OutdatedWithVersionDiff,
  renderCurrent,
  renderDetails,
  renderLatest,
  renderPackageName,
  sortBySemverChange,
  TABLE_OPTIONS,
  toOutdatedWithVersionDiff,
} from '../outdated'

const DEP_PRIORITY: Record<DependenciesField, number> = {
  dependencies: 1,
  devDependencies: 2,
  optionalDependencies: 0,
}

type OutdatedInWorkspace = OutdatedPackage & {
  belongsTo: DependenciesField,
  current?: string,
  dependentPkgs: Array<{ location: string, manifest: PackageJson }>,
  latest?: string,
  packageName: string,
  wanted: string,
}

export default async (
  pkgs: Array<{path: string, manifest: PackageJson}>,
  args: string[],
  cmd: string,
  opts: {
    alwaysAuth: boolean,
    ca?: string,
    cert?: string,
    fetchRetries: number,
    fetchRetryFactor: number,
    fetchRetryMaxtimeout: number,
    fetchRetryMintimeout: number,
    global: boolean,
    httpsProxy?: string,
    independentLeaves: boolean,
    key?: string,
    localAddress?: string,
    networkConcurrency: number,
    offline: boolean,
    prefix: string,
    proxy?: string,
    rawNpmConfig: object,
    registries: Registries,
    lockfileDirectory?: string,
    store?: string,
    strictSsl: boolean,
    tag: string,
    userAgent: string,
  },
) => {
  const outdatedByNameAndType = {} as Record<string, OutdatedInWorkspace>
  if (opts.lockfileDirectory) {
    const outdatedPackagesByProject = await outdatedDependenciesOfWorkspacePackages(pkgs, args, opts)
    for (let { prefix, outdatedPackages, manifest } of outdatedPackagesByProject) {
      outdatedPackages.forEach((outdatedPkg) => {
        const key = JSON.stringify([outdatedPkg.packageName, outdatedPkg.belongsTo])
        if (!outdatedByNameAndType[key]) {
          outdatedByNameAndType[key] = { ...outdatedPkg, dependentPkgs: [] }
        }
        outdatedByNameAndType[key].dependentPkgs.push({ location: prefix, manifest })
      })
    }
  } else {
    await Promise.all(pkgs.map(async ({ manifest, path }) => {
      const { outdatedPackages } = (
        await outdatedDependenciesOfWorkspacePackages([{ manifest, path }], args, { ...opts, lockfileDirectory: path })
      )[0]
      outdatedPackages.forEach((outdatedPkg) => {
        const key = JSON.stringify([outdatedPkg.packageName, outdatedPkg.belongsTo])
        if (!outdatedByNameAndType[key]) {
          outdatedByNameAndType[key] = { ...outdatedPkg, dependentPkgs: [] }
        }
        outdatedByNameAndType[key].dependentPkgs.push({ location: getLockfileImporterId(opts.prefix, path), manifest })
      })
    }))
  }

  const columnNames = ['Package', 'Current', 'Latest', 'Dependents', 'Details']
  let columnFns: Array<(outdatedPkg: OutdatedWithVersionDiff & OutdatedInWorkspace) => string> = [
    R.pipe(renderPackageName, R.partialRight(wrapAnsi, [30, undefined])),
    R.pipe(renderCurrent, R.partialRight(wrapAnsi, [20, undefined])),
    R.pipe(renderLatest, R.partialRight(wrapAnsi, [15, undefined])),
    (outdatedPkg) => outdatedPkg.dependentPkgs
      .map(({ manifest, location }) => manifest.name || location)
      .sort()
      .join(', '),
    renderDetails,
  ]
  const data = [
    columnNames,
    ...R.sortWith(
      [
        sortBySemverChange,
        (o1, o2) => o1.packageName.localeCompare(o2.packageName),
        (o1, o2) => DEP_PRIORITY[o1.belongsTo] - DEP_PRIORITY[o2.belongsTo],
      ],
      (
        Object.values(outdatedByNameAndType).map(toOutdatedWithVersionDiff)
      ),
    )
    .map((outdatedPkg) => columnFns.map((fn) => fn(outdatedPkg))),
  ]
  process.stdout.write(
    table(data, {
      ...TABLE_OPTIONS,
      columns: {
        ...TABLE_OPTIONS.columns,
        // Dependents column:
        3: {
          width: getCellWidth(data, 3, 30),
          wrapWord: true,
        },
      },
    }),
  )
}
