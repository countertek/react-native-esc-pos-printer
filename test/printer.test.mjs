import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';

let connectStatus = 0;
let disconnectStatus = 0;
let nativeStatus = {
  connection: 1,
  online: 1,
  coverOpen: 0,
  paper: 0,
  errorStatus: 0,
};

const nativeModule = {
  addListener: mock.fn(() => ({ remove() {} })),
  getDiscoveryPermissions: mock.fn(async () => ({})),
  requestDiscoveryPermissions: mock.fn(async () => ({})),
  startDiscovery: mock.fn(() => 0),
  stopDiscovery: mock.fn(() => 0),
  connectPrinter: mock.fn(async () => connectStatus),
  disconnectPrinter: mock.fn(async () => disconnectStatus),
  getPrinterStatus: mock.fn(async () => nativeStatus),
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
    return nextResolve(specifier, context);
  },
});
globalThis.__escPosNativeModule = nativeModule;

const { Printer, PrinterError } = await import('../src/Printer.ts');
const { PrintersDiscovery } = await import('../src/Discovery.ts');
const { PrinterConstants } = await import('../src/PrinterConstants.ts');

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const slimStatus = {
  connection: { statusCode: 1, status: 'TRUE', message: 'Connected' },
  online: { statusCode: 1, status: 'TRUE', message: 'Online' },
  coverOpen: { statusCode: 0, status: 'FALSE', message: 'Cover is closed.' },
  paper: { statusCode: 0, status: 'PAPER_OK', message: 'Paper remains.' },
  errorStatus: { statusCode: 0, status: 'NO_ERR', message: 'Normal' },
};

test('new Printer returns the same instance for the same Target', () => {
  const first = new Printer({ target: 'TCP:192.168.1.50', deviceName: 'TM-T88V' });
  const second = new Printer({ target: 'TCP:192.168.1.50', deviceName: 'TM-T88VI' });
  const other = new Printer({ target: 'BT:00:22:15:7D:70:9C', deviceName: 'TM-m30' });

  assert.equal(first, second);
  assert.notEqual(first, other);
  assert.equal(first.deviceName, 'TM-T88V');
});

test('connect talks to native I/O and resolves', async () => {
  nativeModule.connectPrinter.mock.resetCalls();
  const printer = new Printer({ target: 'TCP:10.0.0.1', deviceName: 'TM-T88V' });
  await printer.connect();
  assert.equal(nativeModule.connectPrinter.mock.callCount(), 1);
  assert.deepEqual(nativeModule.connectPrinter.mock.calls[0].arguments, [
    'TCP:10.0.0.1',
    'TM-T88V',
    0,
    15000,
  ]);
});

test('connect succeeds when the Printer is already connected', async () => {
  nativeModule.connectPrinter.mock.resetCalls();
  nativeModule.connectPrinter.mock.mockImplementation(async () => 0);
  const printer = new Printer({ target: 'TCP:10.0.0.2', deviceName: 'TM-T88V' });

  await printer.connect();
  await printer.connect();

  assert.equal(nativeModule.connectPrinter.mock.callCount(), 2);
  nativeModule.connectPrinter.mock.mockImplementation(async () => connectStatus);
});

test('connect throws PrinterError with status, message, and methodName', async () => {
  nativeModule.connectPrinter.mock.mockImplementation(async () => 2);
  const printer = new Printer({ target: 'TCP:10.0.0.3', deviceName: 'TM-T88V' });

  await assert.rejects(
    () => printer.connect(),
    (error) => {
      assert.ok(error instanceof PrinterError);
      assert.equal(error.status, 'ERR_CONNECT');
      assert.equal(error.message, 'Failed to open the Printer.');
      assert.equal(error.methodName, 'connect');
      return true;
    }
  );

  nativeModule.connectPrinter.mock.mockImplementation(async () => connectStatus);
});

test('connect maps SDK recovery failure codes from both platforms', async () => {
  const androidRecovery = new Printer({ target: 'TCP:10.0.0.7', deviceName: 'TM-T88V' });
  nativeModule.connectPrinter.mock.mockImplementation(async () => 16);
  await assert.rejects(
    () => androidRecovery.connect(),
    (error) => {
      assert.ok(error instanceof PrinterError);
      assert.equal(error.status, 'ERR_RECOVERY_FAILURE');
      assert.equal(error.message, 'Failed to recover the Printer.');
      assert.equal(error.methodName, 'connect');
      return true;
    }
  );

  const iosRecovery = new Printer({ target: 'TCP:10.0.0.8', deviceName: 'TM-T88V' });
  nativeModule.connectPrinter.mock.mockImplementation(async () => 17);
  await assert.rejects(
    () => iosRecovery.connect(),
    (error) => {
      assert.ok(error instanceof PrinterError);
      assert.equal(error.status, 'ERR_RECOVERY_FAILURE');
      return true;
    }
  );

  nativeModule.connectPrinter.mock.mockImplementation(async () => connectStatus);
});

test('getStatus returns slim Printer Status fields', async () => {
  nativeStatus = {
    connection: 1,
    online: 1,
    coverOpen: 0,
    paper: 0,
    errorStatus: 0,
  };
  const printer = new Printer({ target: 'TCP:10.0.0.4', deviceName: 'TM-T88V' });
  const status = await printer.getStatus();

  assert.deepEqual(status, {
    connection: { statusCode: 1, status: 'TRUE', message: 'Connected' },
    online: { statusCode: 1, status: 'TRUE', message: 'Online' },
    coverOpen: { statusCode: 0, status: 'FALSE', message: 'Cover is closed.' },
    paper: { statusCode: 0, status: 'PAPER_OK', message: 'Paper remains.' },
    errorStatus: { statusCode: 0, status: 'NO_ERR', message: 'Normal' },
  });
  assert.deepEqual(Object.keys(status), [
    'connection',
    'online',
    'coverOpen',
    'paper',
    'errorStatus',
  ]);
});

test('disconnect ends the session so a later connect talks to native again', async () => {
  nativeModule.connectPrinter.mock.resetCalls();
  nativeModule.connectPrinter.mock.mockImplementation(async () => 0);
  nativeModule.disconnectPrinter.mock.resetCalls();
  nativeModule.disconnectPrinter.mock.mockImplementation(async () => 0);

  const printer = new Printer({ target: 'TCP:10.0.0.5', deviceName: 'TM-T88V' });
  await printer.connect();
  await printer.disconnect();
  await printer.connect();

  assert.equal(nativeModule.disconnectPrinter.mock.callCount(), 1);
  assert.deepEqual(nativeModule.disconnectPrinter.mock.calls[0].arguments, ['TCP:10.0.0.5']);
  assert.equal(nativeModule.connectPrinter.mock.callCount(), 2);
});

test('disconnect talks to native when the Printer is not connected', async () => {
  nativeModule.disconnectPrinter.mock.resetCalls();
  nativeModule.disconnectPrinter.mock.mockImplementation(async () => 0);
  const printer = new Printer({ target: 'TCP:10.0.0.10', deviceName: 'TM-T88V' });

  await printer.disconnect();

  assert.equal(nativeModule.disconnectPrinter.mock.callCount(), 1);
  assert.deepEqual(nativeModule.disconnectPrinter.mock.calls[0].arguments, ['TCP:10.0.0.10']);
  nativeModule.disconnectPrinter.mock.mockImplementation(async () => disconnectStatus);
});

test('disconnect then connect without awaiting talks to native in that order', async () => {
  const nativeOrder = [];
  let releaseDisconnect = () => {};
  let notifyStarted = () => {};
  const disconnectStarted = new Promise((resolve) => {
    notifyStarted = resolve;
  });
  nativeModule.disconnectPrinter.mock.resetCalls();
  nativeModule.disconnectPrinter.mock.mockImplementation(async () => {
    notifyStarted();
    nativeOrder.push('disconnect');
    await new Promise((resolve) => {
      releaseDisconnect = resolve;
    });
    return 0;
  });
  nativeModule.connectPrinter.mock.resetCalls();
  nativeModule.connectPrinter.mock.mockImplementation(async () => {
    nativeOrder.push('connect');
    return 0;
  });

  const printer = new Printer({ target: 'TCP:10.0.0.12', deviceName: 'TM-T88V' });
  const disconnecting = printer.disconnect();
  const connecting = printer.connect();
  await disconnectStarted;

  assert.equal(nativeModule.connectPrinter.mock.callCount(), 0);

  releaseDisconnect();
  await disconnecting;
  await connecting;

  assert.deepEqual(nativeOrder, ['disconnect', 'connect']);
  nativeModule.connectPrinter.mock.mockImplementation(async () => connectStatus);
  nativeModule.disconnectPrinter.mock.mockImplementation(async () => disconnectStatus);
});

test('disconnect issued during connect waits for that connect before talking to native', async () => {
  const nativeOrder = [];
  let releaseConnect = () => {};
  let notifyStarted = () => {};
  const connectStarted = new Promise((resolve) => {
    notifyStarted = resolve;
  });
  nativeModule.connectPrinter.mock.resetCalls();
  nativeModule.connectPrinter.mock.mockImplementation(async () => {
    notifyStarted();
    nativeOrder.push('connect');
    await new Promise((resolve) => {
      releaseConnect = resolve;
    });
    return 0;
  });
  nativeModule.disconnectPrinter.mock.resetCalls();
  nativeModule.disconnectPrinter.mock.mockImplementation(async () => {
    nativeOrder.push('disconnect');
    return 0;
  });

  const printer = new Printer({ target: 'TCP:10.0.0.9', deviceName: 'TM-T88V' });
  const connecting = printer.connect();
  const disconnecting = printer.disconnect();
  await connectStarted;

  assert.equal(nativeModule.disconnectPrinter.mock.callCount(), 0);

  releaseConnect();
  await connecting;
  await disconnecting;

  assert.deepEqual(nativeOrder, ['connect', 'disconnect']);
  assert.deepEqual(nativeModule.disconnectPrinter.mock.calls[0].arguments, ['TCP:10.0.0.9']);
  nativeModule.connectPrinter.mock.mockImplementation(async () => connectStatus);
  nativeModule.disconnectPrinter.mock.mockImplementation(async () => disconnectStatus);
});

test('disconnect still talks to native after a failed connect', async () => {
  nativeModule.connectPrinter.mock.resetCalls();
  nativeModule.connectPrinter.mock.mockImplementation(async () => 2);
  nativeModule.disconnectPrinter.mock.resetCalls();
  nativeModule.disconnectPrinter.mock.mockImplementation(async () => 0);

  const printer = new Printer({ target: 'TCP:10.0.0.11', deviceName: 'TM-T88V' });
  const connecting = printer.connect();
  const disconnecting = printer.disconnect();

  await assert.rejects(() => connecting, PrinterError);
  await disconnecting;

  assert.equal(nativeModule.disconnectPrinter.mock.callCount(), 1);
  nativeModule.connectPrinter.mock.mockImplementation(async () => connectStatus);
  nativeModule.disconnectPrinter.mock.mockImplementation(async () => disconnectStatus);
});

test('disconnect throws PrinterError with status, message, and methodName', async () => {
  nativeModule.connectPrinter.mock.mockImplementation(async () => 0);
  nativeModule.disconnectPrinter.mock.mockImplementation(async () => 10);
  const printer = new Printer({ target: 'TCP:10.0.0.6', deviceName: 'TM-T88V' });
  await printer.connect();

  await assert.rejects(
    () => printer.disconnect(),
    (error) => {
      assert.ok(error instanceof PrinterError);
      assert.equal(error.status, 'ERR_DISCONNECT');
      assert.equal(
        error.message,
        'Failed to disconnect the Printer. Tried to terminate communication with a printer during reconnection process.'
      );
      assert.equal(error.methodName, 'disconnect');
      return true;
    }
  );

  nativeModule.disconnectPrinter.mock.mockImplementation(async () => disconnectStatus);
});

test('connect cancels Discovery auto-stop without a JS Discovery stop', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    PrintersDiscovery.start({ timeout: 5000 });
    nativeModule.stopDiscovery.mock.resetCalls();
    nativeModule.connectPrinter.mock.mockImplementation(async () => 0);
    const printer = new Printer({ target: 'TCP:10.0.0.10', deviceName: 'TM-T88V' });
    await printer.connect();

    assert.equal(nativeModule.stopDiscovery.mock.callCount(), 0);
    mock.timers.tick(5000);
    assert.equal(nativeModule.stopDiscovery.mock.callCount(), 0);
  } finally {
    mock.timers.reset();
    nativeModule.connectPrinter.mock.mockImplementation(async () => connectStatus);
  }
});

test('run returns the callback value and talks to native through the Command Buffer', async () => {
  nativeModule.addText.mock.resetCalls();
  nativeModule.addCut.mock.resetCalls();
  const printer = new Printer({ target: 'TCP:10.0.0.20', deviceName: 'TM-T88V' });

  const value = await printer.run(async (buffer) => {
    await buffer.addTextAlign(PrinterConstants.ALIGN_CENTER);
    await buffer.addTextSize({ width: 2, height: 2 });
    await buffer.addTextStyle({
      reverse: PrinterConstants.FALSE,
      ul: PrinterConstants.FALSE,
      em: PrinterConstants.TRUE,
      color: PrinterConstants.COLOR_1,
    });
    await buffer.addTextLang(PrinterConstants.LANG_EN);
    await buffer.addTextSmooth(PrinterConstants.TRUE);
    await buffer.addText('Hello');
    await buffer.addFeedLine(2);
    await buffer.addLineSpace(30);
    await buffer.addCut(PrinterConstants.CUT_FEED);
    return 'printed';
  });

  assert.equal(value, 'printed');
  assert.deepEqual(nativeModule.addText.mock.calls[0].arguments, ['TCP:10.0.0.20', 'Hello']);
  assert.deepEqual(nativeModule.addCut.mock.calls[0].arguments, [
    'TCP:10.0.0.20',
    PrinterConstants.CUT_FEED,
  ]);
});

test('run serializes Print Jobs on the same Printer', async () => {
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

  const printer = new Printer({ target: 'TCP:10.0.0.21', deviceName: 'TM-T88V' });
  const first = printer.run(async (buffer) => {
    await buffer.addText('first');
  });
  const second = printer.run(async (buffer) => {
    await buffer.addText('second');
  });
  await firstStarted;

  assert.equal(nativeModule.addText.mock.callCount(), 1);
  assert.deepEqual(order, ['first']);

  releaseFirst();
  await first;
  await second;

  assert.deepEqual(order, ['first', 'second']);
  nativeModule.addText.mock.mockImplementation(async () => 0);
});

test('run serializes a Print Job started after the first job is running', async () => {
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

  const printer = new Printer({ target: 'TCP:10.0.0.25', deviceName: 'TM-T88V' });
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

test('nested run on the same Printer throws', async () => {
  const printer = new Printer({ target: 'TCP:10.0.0.22', deviceName: 'TM-T88V' });

  await printer.run(async () => {
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
  });
});

test('nested run after an await on the same Printer throws', async () => {
  const printer = new Printer({ target: 'TCP:10.0.0.26', deviceName: 'TM-T88V' });

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
  });
});

test('run clears the Command Buffer when it exits without a successful send', async () => {
  nativeModule.clearCommandBuffer.mock.resetCalls();
  nativeModule.addText.mock.mockImplementation(async () => 0);
  const printer = new Printer({ target: 'TCP:10.0.0.23', deviceName: 'TM-T88V' });

  await printer.run(async (buffer) => {
    await buffer.addText('unsent');
  });

  assert.equal(nativeModule.clearCommandBuffer.mock.callCount(), 1);
  assert.deepEqual(nativeModule.clearCommandBuffer.mock.calls[0].arguments, ['TCP:10.0.0.23']);

  nativeModule.clearCommandBuffer.mock.resetCalls();
  await assert.rejects(
    () =>
      printer.run(async (buffer) => {
        await buffer.addText('leftover');
        throw new Error('job failed');
      }),
    { message: 'job failed' }
  );
  assert.equal(nativeModule.clearCommandBuffer.mock.callCount(), 1);

  nativeModule.clearCommandBuffer.mock.resetCalls();
  nativeModule.sendPrinterData.mock.mockImplementation(async () => ({
    result: 1,
    resultKind: 'code',
    connection: 1,
    online: 0,
    coverOpen: 0,
    paper: 2,
    errorStatus: 0,
  }));
  await assert.rejects(
    () =>
      printer.run(async (buffer) => {
        await buffer.addText('failed-send');
        await buffer.sendData();
      }),
    PrinterError
  );
  assert.equal(nativeModule.clearCommandBuffer.mock.callCount(), 1);
  nativeModule.sendPrinterData.mock.mockImplementation(async () => ({
    result: 0,
    resultKind: 'code',
    connection: 1,
    online: 1,
    coverOpen: 0,
    paper: 0,
    errorStatus: 0,
  }));
});

test('successful sendData returns slim Printer Status', async () => {
  nativeModule.clearCommandBuffer.mock.resetCalls();
  nativeModule.sendPrinterData.mock.resetCalls();
  const printer = new Printer({ target: 'TCP:10.0.0.24', deviceName: 'TM-T88V' });

  const status = await printer.run(async (buffer) => {
    await buffer.addText('receipt');
    await buffer.addCut();
    return buffer.sendData(5000);
  });

  assert.deepEqual(status, slimStatus);
  assert.deepEqual(Object.keys(status), [
    'connection',
    'online',
    'coverOpen',
    'paper',
    'errorStatus',
  ]);
  assert.deepEqual(nativeModule.sendPrinterData.mock.calls[0].arguments, ['TCP:10.0.0.24', 5000]);
  assert.equal(nativeModule.clearCommandBuffer.mock.callCount(), 0);
});

test('PrinterConstants first-slice values are TypeScript Epson constants', () => {
  assert.equal(PrinterConstants.PARAM_UNSPECIFIED, -1);
  assert.equal(PrinterConstants.PARAM_DEFAULT, -2);
  assert.equal(PrinterConstants.PARAM_UNUSE, -4);
  assert.equal(PrinterConstants.ALIGN_LEFT, 0);
  assert.equal(PrinterConstants.ALIGN_CENTER, 1);
  assert.equal(PrinterConstants.ALIGN_RIGHT, 2);
  assert.equal(PrinterConstants.CUT_FEED, 0);
  assert.equal(PrinterConstants.CUT_NO_FEED, 1);
  assert.equal(PrinterConstants.CUT_RESERVE, 2);
  assert.equal(PrinterConstants.LANG_EN, 0);
  assert.equal(PrinterConstants.LANG_JA, 1);
  assert.equal(PrinterConstants.COLOR_NONE, 0);
  assert.equal(PrinterConstants.COLOR_1, 1);
});

test('types reject printer.addText', () => {
  execFileSync('pnpm', ['exec', 'tsc', '--pretty', 'false', '-p', 'type-tests/tsconfig.json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
});
