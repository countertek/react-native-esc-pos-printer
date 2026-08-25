const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repositoryRoot = path.resolve(__dirname, '..');

test('package exposes its source entry to Metro', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')
  );

  assert.equal(manifest['react-native'], 'src/index.ts');
});

test('Metro block list handles special paths and both separators', () => {
  const projectRoot = path.join(path.sep, 'work[tree', 'example');
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'example', 'metro.config.js'),
    'utf8'
  );
  const config = { resolver: { blockList: [] } };
  const mockRequire = (id) => {
    if (id === 'expo/metro-config') {
      return { getDefaultConfig: () => config };
    }
    if (id === 'path') {
      return path;
    }
    throw new Error(`Unexpected require: ${id}`);
  };
  mockRequire.resolve = (id) => path.join(projectRoot, 'node_modules', id);
  const module = { exports: {} };

  vm.runInNewContext(source, { __dirname: projectRoot, module, require: mockRequire });

  const workspaceNodeModules = path.resolve(projectRoot, '..', 'node_modules');
  const blockList = module.exports.resolver.blockList.at(-1);

  assert.equal(blockList.test(workspaceNodeModules), true);
  assert.equal(blockList.test(`${workspaceNodeModules}/expo`), true);
  assert.equal(blockList.test(`${workspaceNodeModules}\\react`), true);
  assert.equal(blockList.test(`${workspaceNodeModules}-copy/react`), false);
});
