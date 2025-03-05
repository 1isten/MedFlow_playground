import micromatch from 'micromatch'

export default {
  './**/*.js': (stagedFiles) => formatAndEslint(stagedFiles),

  './**/*.{ts,tsx,vue,mts}': (stagedFiles) => [
    ...formatAndEslint(stagedFiles),
    'vue-tsc --noEmit',
    'tsc --noEmit',
    'tsc-strict'
  ]
}

function formatAndEslint(files) {
  const fileNames = micromatch.not(files, ['**/public/**/*.{js,css}'])
  return [
    `eslint --fix ${fileNames.join(' ')}`,
    `prettier --write ${fileNames.join(' ')}`
  ]
}
