import ReactNativeEscPosPrinterModule from './ReactNativeEscPosPrinterModule';

export type DiscoveryStatus = 'discovering' | 'inactive';

export interface DeviceInfo {
  target: string;
  deviceName: string;
  deviceType: string;
  ipAddress: string;
  macAddress: string;
  bdAddress: string;
}

export interface DiscoveryStartParams {
  timeout?: number;
  autoStop?: boolean;
}

export interface NativeDeviceInfo extends Omit<DeviceInfo, 'deviceType'> {
  deviceType: number;
}

export interface NativeDiscoveryError {
  status: number;
  methodName: string;
}

export class PrinterDiscoveryError extends Error {
  readonly status: string;
  readonly methodName: string;

  constructor(status: string, message: string, methodName: string) {
    super(message);
    this.name = 'PrinterDiscoveryError';
    this.status = status;
    this.methodName = methodName;
  }
}

const deviceTypeByCode: Record<number, string> = {
  0: 'TYPE_ALL',
  1: 'TYPE_PRINTER',
  2: 'TYPE_HYBRID_PRINTER',
  3: 'TYPE_DISPLAY',
  4: 'TYPE_KEYBOARD',
  5: 'TYPE_SCANNER',
  6: 'TYPE_SERIAL',
  7: 'TYPE_CCHANGER',
  8: 'TYPE_POS_KEYBOARD',
  9: 'TYPE_CAT',
  10: 'TYPE_MSR',
  11: 'TYPE_OTHER_PERIPHERAL',
  12: 'TYPE_GFE',
};

const discoveryErrorByCode: Record<number, { status: string; message: string }> = {
  1: {
    status: 'ERR_PARAM',
    message: 'An invalid Discovery parameter was passed.',
  },
  4: {
    status: 'ERR_MEMORY',
    message: 'Memory required for Discovery could not be allocated.',
  },
  5: {
    status: 'ERR_ILLEGAL',
    message: 'Discovery is already running, unavailable, or missing permission.',
  },
  6: {
    status: 'ERR_PROCESSING',
    message: 'Discovery could not run.',
  },
  255: {
    status: 'ERR_FAILURE',
    message: 'Discovery failed.',
  },
};

function discoveryError(statusCode: number, methodName: string): PrinterDiscoveryError {
  const error = discoveryErrorByCode[statusCode] ?? discoveryErrorByCode[255];
  return new PrinterDiscoveryError(error.status, error.message, methodName);
}

const discoveredPrinters = new Map<string, DeviceInfo>();
const discoveryListeners = new Set<(printers: DeviceInfo[]) => void>();
let autoStopTimer: number | undefined;

function notifyDiscovery(printers: DeviceInfo[]) {
  for (const listener of [...discoveryListeners]) {
    listener(printers);
  }
}

export const PrintersDiscovery = {
  start(params: DiscoveryStartParams = {}): void {
    clearTimeout(autoStopTimer);
    autoStopTimer = undefined;

    const status = ReactNativeEscPosPrinterModule.startDiscovery();
    if (status !== 0) {
      throw discoveryError(status, 'start');
    }

    discoveredPrinters.clear();
    notifyDiscovery([]);

    if (params.autoStop !== false) {
      autoStopTimer = setTimeout(() => {
        autoStopTimer = undefined;
        ReactNativeEscPosPrinterModule.stopDiscovery();
      }, params.timeout ?? 5000);
    }
  },

  stop(): void {
    clearTimeout(autoStopTimer);
    autoStopTimer = undefined;

    const status = ReactNativeEscPosPrinterModule.stopDiscovery();
    if (status !== 0) {
      throw discoveryError(status, 'stop');
    }
  },

  onDiscovery(listener: (printers: DeviceInfo[]) => void): () => void {
    discoveryListeners.add(listener);
    const subscription = ReactNativeEscPosPrinterModule.addListener('onDiscovery', (printer) => {
      const publicPrinter: DeviceInfo = {
        ...printer,
        deviceType: deviceTypeByCode[printer.deviceType] ?? 'TYPE_ALL',
      };
      discoveredPrinters.set(publicPrinter.target, publicPrinter);
      listener([...discoveredPrinters.values()]);
    });
    return () => {
      discoveryListeners.delete(listener);
      subscription.remove();
    };
  },

  onStatusChange(listener: (status: DiscoveryStatus) => void): () => void {
    const subscription = ReactNativeEscPosPrinterModule.addListener(
      'onStatusChange',
      ({ status }) => listener(status)
    );
    return () => subscription.remove();
  },

  onError(listener: (error: PrinterDiscoveryError) => void): () => void {
    const subscription = ReactNativeEscPosPrinterModule.addListener('onError', (error) => {
      listener(discoveryError(error.status, error.methodName));
    });
    return () => subscription.remove();
  },
};
