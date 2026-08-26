import { NativeModule, requireNativeModule, type PermissionResponse } from 'expo';

import type { DiscoveryStatus, NativeDeviceInfo, NativeDiscoveryError } from './Discovery';

export interface NativePrinterStatus {
  connection: number;
  online: number;
  coverOpen: number;
  paper: number;
  errorStatus: number;
}

type ReactNativeEscPosPrinterEvents = {
  onDiscovery(printer: NativeDeviceInfo): void;
  onStatusChange(event: { status: DiscoveryStatus }): void;
  onError(error: NativeDiscoveryError): void;
};

declare class ReactNativeEscPosPrinterModule extends NativeModule<ReactNativeEscPosPrinterEvents> {
  getDiscoveryPermissions(): Promise<PermissionResponse>;
  requestDiscoveryPermissions(): Promise<PermissionResponse>;
  startDiscovery(): number;
  stopDiscovery(): number;
  connectPrinter(
    target: string,
    deviceName: string,
    lang: number,
    timeout: number
  ): Promise<number>;
  disconnectPrinter(target: string): Promise<number>;
  getPrinterStatus(target: string, deviceName: string, lang: number): Promise<NativePrinterStatus>;
}

export default requireNativeModule<ReactNativeEscPosPrinterModule>('ReactNativeEscPosPrinter');
