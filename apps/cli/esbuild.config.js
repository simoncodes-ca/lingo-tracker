// Must use CommonJS — loaded via Node require() by @nx/esbuild executor
const { readFileSync } = require('fs');
const { resolve } = require('path');

let packageJson;
try {
  packageJson = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`esbuild.config.js: failed to read root package.json — ${message}`, { cause: error });
}

module.exports = {
  define: {
    __CLI_VERSION__: JSON.stringify(packageJson.version),
  },
};
