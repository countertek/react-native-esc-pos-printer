import { NativeModule, requireNativeModule, type PermissionResponse } from 'expo';

import type { DiscoveryStatus, NativeDeviceInfo, NativeDiscoveryError } from './Discovery';

export interface NativePrinterStatus {
  connection: number;
  online: number;
  coverOpen: number;
  paper: number;
  errorStatus: number;
}

export interface NativeSendResult extends NativePrinterStatus {
  result: number;
  resultKind: 'error' | 'code';
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
  addText(target: string, text: string): Promise<number>;
  addTextAlign(target: string, align: number): Promise<number>;
  addTextSize(target: string, width: number, height: number): Promise<number>;
  addTextStyle(
    target: string,
    reverse: number,
    ul: number,
    em: number,
    color: number
  ): Promise<number>;
  addTextLang(target: string, lang: number): Promise<number>;
  addTextSmooth(target: string, smooth: number): Promise<number>;
  addFeedLine(target: string, lines: number): Promise<number>;
  addLineSpace(target: string, space: number): Promise<number>;
  addCut(target: string, type: number): Promise<number>;
  sendPrinterData(target: string, timeout: number): Promise<NativeSendResult>;
  clearCommandBuffer(target: string): Promise<number>;
}

export default requireNativeModule<ReactNativeEscPosPrinterModule>('ReactNativeEscPosPrinter');
