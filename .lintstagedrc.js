const path = require("path");

const buildWebEslintCommand = (filenames) =>
  `yarn workspace @alpacto/web eslint --fix ${filenames
    .map((f) => path.relative(path.join("apps", "web"), f))
    .join(" ")}`;

const checkTypesWebCommand = () => "yarn web:check-types";

const buildContractsEslintCommand = (filenames) =>
  `yarn stylus:lint --fix ${filenames
    .map((f) => path.relative(path.join("packages", "contracts"), f))
    .join(" ")}`;

module.exports = {
  "apps/web/**/*.{ts,tsx}": [buildWebEslintCommand, checkTypesWebCommand],
  "packages/contracts/**/*.{ts,tsx}": [buildContractsEslintCommand],
};
