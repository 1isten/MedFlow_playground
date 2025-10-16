import micromatch from 'micromatch'

export default {
  './**/*.js': (stagedFiles) => formatAndEslint(stagedFiles),

  './**/*.{ts,tsx,vue,mts}': (stagedFiles) => [
    ...formatAndEslint(stagedFiles),
    'pnpm typecheck'
  ]
}

function formatAndEslint(files) {
  const fileNames = micromatch.not(files, ['**/public/**/*.{js,css}'])
  if (fileNames.length === 0) return []
  return [
    `pnpm exec eslint --cache --fix ${fileNames.join(' ')}`,
    `pnpm exec prettier --cache --write ${fileNames.join(' ')}`
  ]
}
