import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mock, test } from 'node:test';
const granted = {
  status: 'granted',
  granted: true,
  canAskAgain: true,
  expires: 'never',
};
const nativeListeners = new Map();

function emit(eventName, payload) {
  for (const listener of nativeListeners.get(eventName) ?? []) {
    listener(payload);
  }
}
let startStatus = 0;
let stopStatus = 0;

const nativeModule = {
  addListener: mock.fn((eventName, listener) => {
    const listeners = nativeListeners.get(eventName) ?? new Set();
    listeners.add(listener);
    nativeListeners.set(eventName, listeners);
    return { remove: () => listeners.delete(listener) };
  }),
  getDiscoveryPermissions: mock.fn(async () => granted),
  requestDiscoveryPermissions: mock.fn(async () => granted),
  startDiscovery: mock.fn(() => startStatus),
  stopDiscovery: mock.fn(() => stopStatus),
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'expo') {
      return {
        url: 'data:text/javascript,export class NativeModule{};export function requireNativeModule(){return globalThis.__escPosNativeModule}',
        shortCircuit: true,
      };
    }
    if (specifier === 'react') {
      return {
        url: new URL('./react-test-hooks.mjs', import.meta.url).href,
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

const { PrintersDiscovery, PrinterDiscoveryError } = await import('../src/Discovery.ts');
const { getDiscoveryPermissions, requestDiscoveryPermissions } = await import('../src/index.ts');
const { usePrintersDiscovery } = await import('../src/usePrintersDiscovery.ts');
const { renderHook, resetHooks } = await import('./react-test-hooks.mjs');

test('permission helpers delegate to the native package seam', async () => {
  assert.deepEqual(await getDiscoveryPermissions(), granted);
  assert.deepEqual(await requestDiscoveryPermissions(), granted);
  assert.equal(nativeModule.getDiscoveryPermissions.mock.callCount(), 1);
  assert.equal(nativeModule.requestDiscoveryPermissions.mock.callCount(), 1);
});

test('PrintersDiscovery controls native I/O and publishes Discovery events', () => {
  const discovered = [];
  const statuses = [];
  const errors = [];
  const removeDiscovery = PrintersDiscovery.onDiscovery((printers) => discovered.push(printers));
  const removeStatus = PrintersDiscovery.onStatusChange((status) => statuses.push(status));
  const removeError = PrintersDiscovery.onError((error) => errors.push(error));

  PrintersDiscovery.start({ autoStop: false });
  emit('onDiscovery', {
    target: 'TCP:192.168.1.10',
    deviceName: 'TM-T88V',
    deviceType: 1,
    ipAddress: '192.168.1.10',
    macAddress: '00:11:22:33:44:55',
    bdAddress: '',
  });
  emit('onDiscovery', {
    target: 'BT:00:22:15:7D:70:9C',
    deviceName: 'TM-m30II',
    deviceType: 1,
    ipAddress: '',
    macAddress: '',
    bdAddress: '00:22:15:7D:70:9C',
  });
  emit('onStatusChange', { status: 'discovering' });
  emit('onError', {
    status: 5,
    methodName: 'start',
  });
  PrintersDiscovery.stop();

  assert.deepEqual(nativeModule.startDiscovery.mock.calls[0].arguments, []);
  assert.equal(nativeModule.stopDiscovery.mock.callCount(), 1);
  assert.deepEqual(
    discovered.map((printers) => printers.map((printer) => printer.target)),
    [[], ['TCP:192.168.1.10'], ['TCP:192.168.1.10', 'BT:00:22:15:7D:70:9C']]
  );
  assert.deepEqual(statuses, ['discovering']);
  assert.equal(errors[0] instanceof PrinterDiscoveryError, true);
  assert.deepEqual(
    {
      status: errors[0].status,
      message: errors[0].message,
      methodName: errors[0].methodName,
    },
    {
      status: 'ERR_ILLEGAL',
      message: 'Discovery is already running, unavailable, or missing permission.',
      methodName: 'start',
    }
  );

  removeDiscovery();
  removeStatus();
  removeError();
  emit('onStatusChange', { status: 'inactive' });
  assert.deepEqual(statuses, ['discovering']);
});

test('PrintersDiscovery throws actionable native start and stop failures', () => {
  startStatus = 5;
  assert.throws(
    () => PrintersDiscovery.start({ autoStop: false }),
    (error) =>
      error instanceof PrinterDiscoveryError &&
      error.status === 'ERR_ILLEGAL' &&
      error.methodName === 'start'
  );
  startStatus = 0;

  stopStatus = 6;
  assert.throws(
    () => PrintersDiscovery.stop(),
    (error) =>
      error instanceof PrinterDiscoveryError &&
      error.status === 'ERR_PROCESSING' &&
      error.methodName === 'stop'
  );
  stopStatus = 0;
});

test('PrintersDiscovery emits an empty snapshot only after native start succeeds', () => {
  const snapshots = [];
  const removeDiscovery = PrintersDiscovery.onDiscovery((printers) => {
    snapshots.push(printers.map((printer) => printer.target));
  });

  PrintersDiscovery.start({ autoStop: false });
  emit('onDiscovery', {
    target: 'TCP:10.0.0.5',
    deviceName: 'TM-T88V',
    deviceType: 1,
    ipAddress: '10.0.0.5',
    macAddress: '00:11:22:33:44:55',
    bdAddress: '',
  });
  PrintersDiscovery.stop();

  startStatus = 5;
  assert.throws(
    () => PrintersDiscovery.start({ autoStop: false }),
    (error) => error instanceof PrinterDiscoveryError && error.status === 'ERR_ILLEGAL'
  );
  startStatus = 0;

  assert.deepEqual(snapshots.at(-1), ['TCP:10.0.0.5']);

  PrintersDiscovery.start({ autoStop: false });
  assert.deepEqual(snapshots.at(-1), []);

  removeDiscovery();
});

test('Bluetooth denial does not block Discovery start', async () => {
  const denied = {
    status: 'denied',
    granted: false,
    canAskAgain: false,
    expires: 'never',
  };
  nativeModule.getDiscoveryPermissions.mock.mockImplementation(async () => denied);
  nativeModule.requestDiscoveryPermissions.mock.mockImplementation(async () => denied);
  const startsBefore = nativeModule.startDiscovery.mock.callCount();

  const current = await getDiscoveryPermissions();
  const next = current.granted ? current : await requestDiscoveryPermissions();
  assert.equal(next.granted, false);
  PrintersDiscovery.start({ autoStop: false });

  assert.equal(nativeModule.startDiscovery.mock.callCount(), startsBefore + 1);
  nativeModule.getDiscoveryPermissions.mock.mockImplementation(async () => granted);
  nativeModule.requestDiscoveryPermissions.mock.mockImplementation(async () => granted);
  PrintersDiscovery.stop();
});

test('usePrintersDiscovery sets discovering at the start and stop boundary', () => {
  resetHooks();
  let discovery = renderHook(() => usePrintersDiscovery());
  assert.equal(discovery.isDiscovering, false);
  assert.deepEqual(discovery.printers, []);

  discovery.start({ autoStop: false });
  discovery = renderHook(() => usePrintersDiscovery());
  assert.equal(discovery.isDiscovering, true);
  assert.deepEqual(discovery.printers, []);

  emit('onDiscovery', {
    target: 'USB:',
    deviceName: 'TM-T20III',
    deviceType: 1,
    ipAddress: '',
    macAddress: '',
    bdAddress: '',
  });
  discovery = renderHook(() => usePrintersDiscovery());
  assert.deepEqual(
    discovery.printers.map((printer) => ({
      target: printer.target,
      deviceName: printer.deviceName,
      deviceType: printer.deviceType,
    })),
    [{ target: 'USB:', deviceName: 'TM-T20III', deviceType: 'TYPE_PRINTER' }]
  );

  discovery.stop();
  discovery = renderHook(() => usePrintersDiscovery());
  assert.equal(discovery.isDiscovering, false);
});

test('usePrintersDiscovery reports inactive when start fails with no running search', () => {
  resetHooks();
  let discovery = renderHook(() => usePrintersDiscovery());
  startStatus = 5;
  assert.throws(
    () => discovery.start({ autoStop: false }),
    (error) => error instanceof PrinterDiscoveryError && error.status === 'ERR_ILLEGAL'
  );
  startStatus = 0;
  discovery = renderHook(() => usePrintersDiscovery());
  assert.equal(discovery.isDiscovering, false);
});
