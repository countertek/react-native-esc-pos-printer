import { useCallback, useEffect, useState } from 'react';

import {
  PrintersDiscovery,
  type DeviceInfo,
  type DiscoveryStartParams,
  type PrinterDiscoveryError,
} from './Discovery';

export interface PrintersDiscoveryState {
  printers: DeviceInfo[];
  isDiscovering: boolean;
  printerError: PrinterDiscoveryError | null;
  start(params?: DiscoveryStartParams): void;
  stop(): void;
}

export function usePrintersDiscovery(): PrintersDiscoveryState {
  const [printers, setPrinters] = useState<DeviceInfo[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [printerError, setPrinterError] = useState<PrinterDiscoveryError | null>(null);

  useEffect(() => {
    const removeDiscovery = PrintersDiscovery.onDiscovery(setPrinters);
    const removeStatus = PrintersDiscovery.onStatusChange((status) => {
      setIsDiscovering(status === 'discovering');
    });
    const removeError = PrintersDiscovery.onError(setPrinterError);

    return () => {
      removeDiscovery();
      removeStatus();
      removeError();
    };
  }, []);

  const start = useCallback((params?: DiscoveryStartParams) => {
    setPrinters([]);
    setPrinterError(null);
    PrintersDiscovery.start(params);
  }, []);

  const stop = useCallback(() => {
    PrintersDiscovery.stop();
  }, []);

  return { printers, isDiscovering, printerError, start, stop };
}
