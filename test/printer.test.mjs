import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mock, test } from 'node:test';

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

test('disconnect talks to native while connect is in flight', async () => {
  let releaseConnect = () => {};
  let notifyStarted = () => {};
  const connectStarted = new Promise((resolve) => {
    notifyStarted = resolve;
  });
  nativeModule.connectPrinter.mock.resetCalls();
  nativeModule.connectPrinter.mock.mockImplementation(async () => {
    notifyStarted();
    await new Promise((resolve) => {
      releaseConnect = resolve;
    });
    return 0;
  });
  nativeModule.disconnectPrinter.mock.resetCalls();
  nativeModule.disconnectPrinter.mock.mockImplementation(async () => 0);

  const printer = new Printer({ target: 'TCP:10.0.0.9', deviceName: 'TM-T88V' });
  const connecting = printer.connect();
  await connectStarted;
  const disconnecting = printer.disconnect();
  releaseConnect();
  await connecting;
  await disconnecting;

  assert.equal(nativeModule.disconnectPrinter.mock.callCount(), 1);
  assert.deepEqual(nativeModule.disconnectPrinter.mock.calls[0].arguments, ['TCP:10.0.0.9']);
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