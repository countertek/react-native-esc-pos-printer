import { NativeModule, requireNativeModule, type PermissionResponse } from 'expo';

import type { DiscoveryStatus, NativeDeviceInfo, NativeDiscoveryError } from './Discovery';

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
}

export default requireNativeModule<ReactNativeEscPosPrinterModule>('ReactNativeEscPosPrinter');
