import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mock, test } from 'node:test';

const getBuiltinModule = process.getBuiltinModule.bind(process);
process.getBuiltinModule = (id) => {
  if (id === 'async_hooks') {
    return {};
  }
  return getBuiltinModule(id);
};

const nativeModule = {
  addListener: mock.fn(() => ({ remove() {} })),
  addText: mock.fn(async () => 0),
  addTextAlign: mock.fn(async () => 0),
  addTextSize: mock.fn(async () => 0),
  addTextStyle: mock.fn(async () => 0),
  addTextLang: mock.fn(async () => 0),
  addTextSmooth: mock.fn(async () => 0),
  addFeedLine: mock.fn(async () => 0),
  addLineSpace: mock.fn(async () => 0),
  addCut: mock.fn(async () => 0),
  sendPrinterData: mock.fn(async () => ({
    result: 0,
    resultKind: 'code',
    connection: 1,
    online: 1,
    coverOpen: 0,
    paper: 0,
    errorStatus: 0,
  })),
  clearCommandBuffer: mock.fn(async () => 0),
  connectPrinter: mock.fn(async () => 0),
  disconnectPrinter: mock.fn(async () => 0),
  getPrinterStatus: mock.fn(async () => ({
    connection: 1,
    online: 1,
    coverOpen: 0,
    paper: 0,
    errorStatus: 0,
  })),
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo') {
      return {
        url: 'data:text/javascript,export class NativeModule{};export function requireNativeModule(){return globalThis.__escPosNativeModule}',
        shortCircuit: true,
      };
    }
    if (specifier.startsWith('.') && context.parentURL?.includes('/src/')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier);
  },
});
globalThis.__escPosNativeModule = nativeModule;

const { Printer, PrinterError } = await import('../src/Printer.ts');

test('nested run after await throws without async_hooks', { timeout: 2000 }, async () => {
  const printer = new Printer({ target: 'TCP:10.0.0.40', deviceName: 'TM-T88V' });

  await printer.run(async (buffer) => {
    await buffer.addText('outer');
    assert.throws(
      () => printer.run(async () => 'nested'),
      (error) => {
        assert.ok(error instanceof PrinterError);
        assert.equal(error.status, 'ERR_ILLEGAL');
        assert.equal(error.message, 'A Print Job is already running on this Printer.');
        assert.equal(error.methodName, 'run');
        return true;
      }
    );
    await assert.rejects(
      async () => {
        await printer.run(async () => 'nested-awaited');
      },
      (error) => {
        assert.ok(error instanceof PrinterError);
        assert.equal(error.status, 'ERR_ILLEGAL');
        assert.equal(error.message, 'A Print Job is already running on this Printer.');
        assert.equal(error.methodName, 'run');
        return true;
      }
    );
  });
});

test('sequential run works after a fallback job settles', async () => {
  const printer = new Printer({ target: 'TCP:10.0.0.42', deviceName: 'TM-T88V' });

  await printer.run(async (buffer) => {
    await buffer.addText('first');
  });
  await printer.run(async (buffer) => {
    await buffer.addText('second');
  });
});

test('sibling run after the first fallback job has started waits', async () => {
  const order = [];
  let releaseFirst = () => {};
  let notifyStarted = () => {};
  const firstStarted = new Promise((resolve) => {
    notifyStarted = resolve;
  });
  nativeModule.addText.mock.resetCalls();
  nativeModule.addText.mock.mockImplementation(async (_target, text) => {
    order.push(text);
    if (text === 'first') {
      notifyStarted();
      await new Promise((resolve) => {
        releaseFirst = resolve;
      });
    }
    return 0;
  });

  const printer = new Printer({ target: 'TCP:10.0.0.41', deviceName: 'TM-T88V' });
  const first = printer.run(async (buffer) => {
    await buffer.addText('first');
  });
  await firstStarted;

  const second = printer.run(async (buffer) => {
    await buffer.addText('second');
  });

  assert.equal(nativeModule.addText.mock.callCount(), 1);
  assert.deepEqual(order, ['first']);

  releaseFirst();
  await first;
  await second;

  assert.deepEqual(order, ['first', 'second']);
  nativeModule.addText.mock.mockImplementation(async () => 0);
});
