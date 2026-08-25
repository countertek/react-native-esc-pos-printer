const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const parentNodeModules = path.resolve(workspaceRoot, 'node_modules').replace(/\\/g, '\\\\');
const config = getDefaultConfig(projectRoot);

config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  new RegExp(`${parentNodeModules}(?:/|$)`),
];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.extraNodeModules = {
  '@countertek/react-native-esc-pos-printer': workspaceRoot,
  expo: path.dirname(require.resolve('expo/package.json', { paths: [projectRoot] })),
  react: path.dirname(require.resolve('react/package.json', { paths: [projectRoot] })),
  'react-native': path.dirname(
    require.resolve('react-native/package.json', { paths: [projectRoot] })
  ),
};
config.watchFolders = [workspaceRoot];

module.exports = config;
