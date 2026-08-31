import { cancelDiscoveryAutoStop, rememberSessionPrinter } from './Discovery';
import { createPrintJobContext } from './printJobContext';
import { PrinterConstants } from './PrinterConstants';
import ReactNativeEscPosPrinterModule, {
  type NativePrinterStatus,
  type NativeSendResult,
} from './ReactNativeEscPosPrinterModule';

export interface PrinterParams {
  target: string;
  deviceName: string;
  lang?: number;
}

export interface PrinterStatusField {
  statusCode: number;
  status: string;
  message: string;
}

export interface PrinterStatus {
  connection: PrinterStatusField;
  online: PrinterStatusField;
  coverOpen: PrinterStatusField;
  paper: PrinterStatusField;
  errorStatus: PrinterStatusField;
}

export interface CommandBuffer {
  addText(text: string): Promise<void>;
  addTextAlign(align?: number): Promise<void>;
  addTextSize(params?: { width?: number; height?: number }): Promise<void>;
  addTextStyle(params?: {
    reverse?: number;
    ul?: number;
    em?: number;
    color?: number;
  }): Promise<void>;
  addTextLang(lang?: number): Promise<void>;
  addTextSmooth(smooth?: number): Promise<void>;
  addFeedLine(lines?: number): Promise<void>;
  addLineSpace(space: number): Promise<void>;
  addCut(type?: number): Promise<void>;
  sendData(timeout?: number): Promise<PrinterStatus>;
}

export class PrinterError extends Error {
  readonly status: string;
  readonly methodName: string;

  constructor(status: string, message: string, methodName: string) {
    super(message);
    this.name = 'PrinterError';
    this.status = status;
    this.methodName = methodName;
  }
}

const connectErrorByCode: Record<number, { status: string; message: string }> = {
  1: { status: 'ERR_PARAM', message: 'An invalid parameter was passed.' },
  2: { status: 'ERR_CONNECT', message: 'Failed to open the Printer.' },
  3: {
    status: 'ERR_TIMEOUT',
    message: 'Failed to communicate with the Printer within the specified time.',
  },
  4: { status: 'ERR_MEMORY', message: 'Memory necessary for processing could not be allocated.' },
  5: {
    status: 'ERR_ILLEGAL',
    message:
      'Tried to start communication with a printer with which communication had been already established. Tried to start communication with a printer during reconnection process.',
  },
  6: { status: 'ERR_PROCESSING', message: 'Could not run the process.' },
  7: { status: 'ERR_NOT_FOUND', message: 'The Printer could not be found.' },
  8: { status: 'ERR_IN_USE', message: 'The Printer was in use.' },
  9: { status: 'ERR_TYPE_INVALID', message: 'The Printer type is different.' },
  15: { status: 'ERR_UNSUPPORTED', message: 'This function is not supported on this Printer.' },
  16: { status: 'ERR_RECOVERY_FAILURE', message: 'Failed to recover the Printer.' },
  17: { status: 'ERR_RECOVERY_FAILURE', message: 'Failed to recover the Printer.' },
  255: { status: 'ERR_FAILURE', message: 'An unknown error occurred.' },
};

const disconnectErrorByCode: Record<number, { status: string; message: string }> = {
  4: { status: 'ERR_MEMORY', message: 'Necessary memory could not be allocated.' },
  5: {
    status: 'ERR_ILLEGAL',
    message: 'Tried to end communication where it had not been established.',
  },
  6: { status: 'ERR_PROCESSING', message: 'Could not run the process.' },
  10: {
    status: 'ERR_DISCONNECT',
    message:
      'Failed to disconnect the Printer. Tried to terminate communication with a printer during reconnection process.',
  },
  255: { status: 'ERR_FAILURE', message: 'An unknown error occurred.' },
};

const commandErrorByCode: Record<number, { status: string; message: string }> = {
  1: { status: 'ERR_PARAM', message: 'An invalid parameter was passed.' },
  4: { status: 'ERR_MEMORY', message: 'Memory necessary for processing could not be allocated.' },
  5: {
    status: 'ERR_ILLEGAL',
    message: 'The Printer is in an illegal state for this Command Buffer method.',
  },
  6: { status: 'ERR_PROCESSING', message: 'Could not run the process.' },
  255: { status: 'ERR_FAILURE', message: 'An unknown error occurred.' },
};

const sendErrorByCode: Record<number, { status: string; message: string }> = {
  1: { status: 'ERR_PARAM', message: 'An invalid parameter was passed.' },
  3: {
    status: 'ERR_TIMEOUT',
    message: 'Failed to communicate with the Printer within the specified time.',
  },
  4: { status: 'ERR_MEMORY', message: 'Memory necessary for processing could not be allocated.' },
  5: {
    status: 'ERR_ILLEGAL',
    message: 'The Printer is not connected or cannot start a send.',
  },
  6: { status: 'ERR_PROCESSING', message: 'Could not run the process.' },
  255: { status: 'ERR_FAILURE', message: 'An unknown error occurred.' },
};

const sendCodeByCode: Record<number, { status: string; message: string }> = {
  1: {
    status: 'CODE_ERR_TIMEOUT',
    message: 'Failed to communicate with the Printer within the specified time.',
  },
  2: { status: 'CODE_ERR_NOT_FOUND', message: 'The Printer could not be found.' },
  3: { status: 'CODE_ERR_AUTORECOVER', message: 'Automatic recovery error occurred.' },
  4: { status: 'CODE_ERR_COVER_OPEN', message: 'Cover is open.' },
  5: { status: 'CODE_ERR_CUTTER', message: 'Auto cutter error occurred.' },
  6: { status: 'CODE_ERR_MECHANICAL', message: 'Mechanical error occurred.' },
  7: { status: 'CODE_ERR_EMPTY', message: 'Paper has run out.' },
  8: { status: 'CODE_ERR_UNRECOVERABLE', message: 'Unrecoverable error occurred.' },
  9: { status: 'CODE_ERR_SYSTEM', message: 'System error occurred.' },
  10: { status: 'CODE_ERR_PORT', message: 'Error detected with the communication port.' },
  255: { status: 'CODE_ERR_FAILURE', message: 'An unknown error occurred.' },
};

const connectionByCode: Record<number, { status: string; message: string }> = {
  [PrinterConstants.TRUE]: { status: 'TRUE', message: 'Connected' },
  [PrinterConstants.FALSE]: { status: 'FALSE', message: 'Status is unknown.' },
};

const onlineByCode: Record<number, { status: string; message: string }> = {
  [PrinterConstants.TRUE]: { status: 'TRUE', message: 'Online' },
  [PrinterConstants.FALSE]: { status: 'FALSE', message: 'Offline' },
  [PrinterConstants.UNKNOWN]: { status: 'UNKNOWN', message: 'Status is unknown.' },
};

const coverOpenByCode: Record<number, { status: string; message: string }> = {
  [PrinterConstants.TRUE]: { status: 'TRUE', message: 'Cover is open.' },
  [PrinterConstants.FALSE]: { status: 'FALSE', message: 'Cover is closed.' },
  [PrinterConstants.UNKNOWN]: { status: 'UNKNOWN', message: 'Status is unknown.' },
};

const paperByCode: Record<number, { status: string; message: string }> = {
  [PrinterConstants.PAPER_OK]: { status: 'PAPER_OK', message: 'Paper remains.' },
  [PrinterConstants.PAPER_NEAR_END]: { status: 'PAPER_NEAR_END', message: 'Paper is running out.' },
  [PrinterConstants.PAPER_EMPTY]: { status: 'PAPER_EMPTY', message: 'Paper has run out.' },
  [PrinterConstants.UNKNOWN]: { status: 'UNKNOWN', message: 'Status is unknown.' },
};

const errorStatusByCode: Record<number, { status: string; message: string }> = {
  [PrinterConstants.NO_ERR]: { status: 'NO_ERR', message: 'Normal' },
  [PrinterConstants.MECHANICAL_ERR]: {
    status: 'MECHANICAL_ERR',
    message: 'Mechanical error occurred.',
  },
  [PrinterConstants.AUTOCUTTER_ERR]: {
    status: 'AUTOCUTTER_ERR',
    message: 'Auto cutter error occurred.',
  },
  [PrinterConstants.UNRECOVER_ERR]: {
    status: 'UNRECOVER_ERR',
    message: 'Unrecoverable error occurred.',
  },
  [PrinterConstants.AUTORECOVER_ERR]: {
    status: 'AUTORECOVER_ERR',
    message: 'Automatic recovery error occurred.',
  },
  [PrinterConstants.UNKNOWN]: { status: 'UNKNOWN', message: 'Status is unknown.' },
};

function connectError(statusCode: number): PrinterError {
  const error = connectErrorByCode[statusCode] ?? connectErrorByCode[255];
  return new PrinterError(error.status, error.message, 'connect');
}

function disconnectError(statusCode: number): PrinterError {
  const error = disconnectErrorByCode[statusCode] ?? disconnectErrorByCode[255];
  return new PrinterError(error.status, error.message, 'disconnect');
}

function commandError(statusCode: number, methodName: string): PrinterError {
  const error = commandErrorByCode[statusCode] ?? commandErrorByCode[255];
  return new PrinterError(error.status, error.message, methodName);
}

function sendError(raw: NativeSendResult): PrinterError {
  const mapping = raw.resultKind === 'error' ? sendErrorByCode : sendCodeByCode;
  const error = mapping[raw.result] ?? mapping[255];
  return new PrinterError(error.status, error.message, 'sendData');
}

function statusField(
  statusCode: number,
  mapping: Record<number, { status: string; message: string }>
): PrinterStatusField {
  const mapped = mapping[statusCode] ?? { status: 'UNKNOWN', message: 'Status is unknown.' };
  return { statusCode, status: mapped.status, message: mapped.message };
}

function toPrinterStatus(raw: NativePrinterStatus): PrinterStatus {
  return {
    connection: statusField(raw.connection, connectionByCode),
    online: statusField(raw.online, onlineByCode),
    coverOpen: statusField(raw.coverOpen, coverOpenByCode),
    paper: statusField(raw.paper, paperByCode),
    errorStatus: statusField(raw.errorStatus, errorStatusByCode),
  };
}

class PrinterCommandBuffer implements CommandBuffer {
  private active = true;
  hasUnsentCommands = false;
  private readonly target: string;

  constructor(target: string) {
    this.target = target;
  }

  invalidate() {
    this.active = false;
  }

  private assertActive(methodName: string) {
    if (!this.active) {
      throw new PrinterError(
        'ERR_ILLEGAL',
        'Command Buffer methods are only available inside run.',
        methodName
      );
    }
  }

  private async add(methodName: string, invoke: () => Promise<number>): Promise<void> {
    this.assertActive(methodName);
    const status = await invoke();
    if (status !== 0) {
      throw commandError(status, methodName);
    }
    this.hasUnsentCommands = true;
  }

  addText(text: string): Promise<void> {
    return this.add('addText', () => ReactNativeEscPosPrinterModule.addText(this.target, text));
  }

  addTextAlign(align: number = PrinterConstants.PARAM_DEFAULT): Promise<void> {
    return this.add('addTextAlign', () =>
      ReactNativeEscPosPrinterModule.addTextAlign(this.target, align)
    );
  }

  addTextSize({
    width = PrinterConstants.PARAM_DEFAULT,
    height = PrinterConstants.PARAM_DEFAULT,
  }: { width?: number; height?: number } = {}): Promise<void> {
    return this.add('addTextSize', () =>
      ReactNativeEscPosPrinterModule.addTextSize(this.target, width, height)
    );
  }

  addTextStyle({
    reverse = PrinterConstants.PARAM_DEFAULT,
    ul = PrinterConstants.PARAM_DEFAULT,
    em = PrinterConstants.PARAM_DEFAULT,
    color = PrinterConstants.PARAM_DEFAULT,
  }: { reverse?: number; ul?: number; em?: number; color?: number } = {}): Promise<void> {
    return this.add('addTextStyle', () =>
      ReactNativeEscPosPrinterModule.addTextStyle(this.target, reverse, ul, em, color)
    );
  }

  addTextLang(lang: number = PrinterConstants.PARAM_DEFAULT): Promise<void> {
    return this.add('addTextLang', () =>
      ReactNativeEscPosPrinterModule.addTextLang(this.target, lang)
    );
  }

  addTextSmooth(smooth: number = PrinterConstants.PARAM_DEFAULT): Promise<void> {
    return this.add('addTextSmooth', () =>
      ReactNativeEscPosPrinterModule.addTextSmooth(this.target, smooth)
    );
  }

  addFeedLine(lines = 1): Promise<void> {
    return this.add('addFeedLine', () =>
      ReactNativeEscPosPrinterModule.addFeedLine(this.target, lines)
    );
  }

  addLineSpace(space: number): Promise<void> {
    return this.add('addLineSpace', () =>
      ReactNativeEscPosPrinterModule.addLineSpace(this.target, space)
    );
  }

  addCut(type: number = PrinterConstants.PARAM_DEFAULT): Promise<void> {
    return this.add('addCut', () => ReactNativeEscPosPrinterModule.addCut(this.target, type));
  }

  async sendData(timeout = 5000): Promise<PrinterStatus> {
    this.assertActive('sendData');
    const raw = await ReactNativeEscPosPrinterModule.sendPrinterData(this.target, timeout);
    if (raw.result !== 0) {
      throw sendError(raw);
    }
    this.hasUnsentCommands = false;
    return toPrinterStatus(raw);
  }
}

const printJobContext = createPrintJobContext();

export class Printer {
  private static readonly instances = new Map<string, Printer>();

  readonly target!: string;
  readonly deviceName!: string;
  private readonly lang!: number;
  private sessionOp: Promise<void> = Promise.resolve();

  constructor({ target, deviceName, lang = PrinterConstants.MODEL_ANK }: PrinterParams) {
    const existing = Printer.instances.get(target);
    if (existing) {
      return existing;
    }

    this.target = target;
    this.deviceName = deviceName;
    this.lang = lang;
    Printer.instances.set(target, this);
    rememberSessionPrinter(target, deviceName);
  }

  async connect(timeout = 15000): Promise<void> {
    cancelDiscoveryAutoStop();
    return this.enqueueSessionOp(async () => {
      const status = await ReactNativeEscPosPrinterModule.connectPrinter(
        this.target,
        this.deviceName,
        this.lang,
        timeout
      );
      if (status !== 0) {
        throw connectError(status);
      }
    });
  }

  async getStatus(): Promise<PrinterStatus> {
    const raw = await ReactNativeEscPosPrinterModule.getPrinterStatus(
      this.target,
      this.deviceName,
      this.lang
    );
    return toPrinterStatus(raw);
  }

  async disconnect(): Promise<void> {
    return this.enqueueSessionOp(async () => {
      const status = await ReactNativeEscPosPrinterModule.disconnectPrinter(this.target);
      if (status !== 0) {
        throw disconnectError(status);
      }
    });
  }

  run<T>(job: (buffer: CommandBuffer) => Promise<T>): Promise<T> {
    if (printJobContext.getStore() === this) {
      throw new PrinterError(
        'ERR_ILLEGAL',
        'A Print Job is already running on this Printer.',
        'run'
      );
    }

    return this.enqueueSessionOp(() =>
      printJobContext.run(this, async () => {
        const buffer = new PrinterCommandBuffer(this.target);
        try {
          return await job(buffer);
        } finally {
          buffer.invalidate();
          if (buffer.hasUnsentCommands) {
            await ReactNativeEscPosPrinterModule.clearCommandBuffer(this.target);
          }
        }
      })
    );
  }

  private enqueueSessionOp<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.sessionOp.then(operation);
    this.sessionOp = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
