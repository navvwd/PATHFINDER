// Metro config: lets the app import the monorepo's shared TypeScript packages
// (api-client, shared-types, validation, design-system) without duplicating code.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(repoRoot, "packages")];
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
config.resolver.extraNodeModules = {
  "@pathfinder/api-client": path.join(repoRoot, "packages/api-client/src"),
  "@pathfinder/shared-types": path.join(repoRoot, "packages/shared-types/src"),
  "@pathfinder/validation": path.join(repoRoot, "packages/validation/src"),
  "@pathfinder/design-system": path.join(repoRoot, "packages/design-system/src"),
};
// Shared packages import no React; zod resolves from this app first.


module.exports = withNativeWind(config, { input: "./global.css" });
