const fs = require('fs');
const path = require('path');

const generatedHeaderPath = path.join(
  __dirname,
  '../ios/generated/RNEscPosPrinterSpec/RNEscPosPrinterSpec.h'
);
const lines = fs.readFileSync(generatedHeaderPath, 'utf8').split('\n');

let constantsBuilderCount = 0;
let patchedBuilderCount = 0;

for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
  if (lines[lineIndex].trim() !== 'struct Constants {') continue;

  let builderLineIndex = lineIndex + 1;
  while (lines[builderLineIndex]?.trim() === '') builderLineIndex += 1;

  if (lines[builderLineIndex]?.trim() !== 'struct Builder {') {
    throw new Error(
      `Expected Constants::Builder in generated header at line ${lineIndex + 1}`
    );
  }

  constantsBuilderCount += 1;

  let inputLineIndex = builderLineIndex + 1;
  while (
    inputLineIndex < lines.length &&
    lines[inputLineIndex].trim() !== 'struct Input {'
  ) {
    inputLineIndex += 1;
  }

  const hasResultType = lines
    .slice(builderLineIndex + 1, inputLineIndex)
    .some((line) => line.trim() === 'using ResultT = Constants;');

  if (hasResultType) continue;

  lines.splice(
    builderLineIndex + 1,
    0,
    '        // Required by React Native 0.85+ RCTTypedModuleConstants.',
    '        using ResultT = Constants;',
    ''
  );
  patchedBuilderCount += 1;
  lineIndex += 3;
}

if (constantsBuilderCount === 0) {
  throw new Error(
    'No Constants::Builder declarations found in generated header'
  );
}

if (patchedBuilderCount > 0) {
  fs.writeFileSync(generatedHeaderPath, lines.join('\n'));
  console.log(
    `Patched ${patchedBuilderCount} iOS codegen Constants::Builder declarations`
  );
}
