import { Platform } from 'react-native';

import { EscPosPrinterDiscovery } from '../../specs';
import { PrintersDiscovery } from '../PrintersDiscovery';

jest.mock('../../specs', () => ({
  EscPosPrinterDiscovery: {
    getConstants: () => new Proxy({}, { get: () => 0 }),
    pairBluetoothDevice: jest.fn(),
  },
}));

const pairBluetoothDeviceMock = jest.mocked(
  EscPosPrinterDiscovery.pairBluetoothDevice
);
const originalPlatform = Platform.OS;

describe('PrintersDiscovery.pairBluetoothDevice', () => {
  beforeEach(() => {
    pairBluetoothDeviceMock.mockReset();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
  });

  it('returns the paired printer address on iOS', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });
    pairBluetoothDeviceMock.mockResolvedValue('BT:00:11:22:33:44:55');

    await expect(PrintersDiscovery.pairBluetoothDevice()).resolves.toBe(
      'BT:00:11:22:33:44:55'
    );
    expect(pairBluetoothDeviceMock).toHaveBeenCalledWith('');
  });

  it('returns an empty address without calling the native module on Android', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });

    await expect(
      PrintersDiscovery.pairBluetoothDevice('BT:00:11:22:33:44:55')
    ).resolves.toBe('');
    expect(pairBluetoothDeviceMock).not.toHaveBeenCalled();
  });
});
