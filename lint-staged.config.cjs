const micromatch = require('micromatch')

module.exports = {
  './**/*.js': (stagedFiles) => formatAndEslint(stagedFiles),

  './**/*.{ts,tsx,vue,mts}': (stagedFiles) => [
    ...formatAndEslint(stagedFiles),
    'vue-tsc --noEmit'
  ]
}

function formatAndEslint(files) {
  const fileNames = micromatch.not(files, ['**/public/**/*.{js,css}'])
  if (fileNames.length === 0) return []
  // Convert absolute paths to relative paths for better ESLint resolution
  const relativePaths = fileNames.map((f) => f.replace(process.cwd() + '/', ''))
  return [
    `pnpm exec eslint --cache --fix --no-warn-ignored ${relativePaths.join(' ')}`,
    `pnpm exec prettier --cache --write ${relativePaths.join(' ')}`
  ]
}
