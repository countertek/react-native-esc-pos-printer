import ReactNativeEscPosPrinterModule from './ReactNativeEscPosPrinterModule';

export { default } from './ReactNativeEscPosPrinterModule';
export { PrintersDiscovery, PrinterDiscoveryError } from './Discovery';
export type { DeviceInfo, DiscoveryStartParams, DiscoveryStatus } from './Discovery';
export { usePrintersDiscovery } from './usePrintersDiscovery';
export type { PrintersDiscoveryState } from './usePrintersDiscovery';

export function getDiscoveryPermissions() {
  return ReactNativeEscPosPrinterModule.getDiscoveryPermissions();
}

export function requestDiscoveryPermissions() {
  return ReactNativeEscPosPrinterModule.requestDiscoveryPermissions();
}
