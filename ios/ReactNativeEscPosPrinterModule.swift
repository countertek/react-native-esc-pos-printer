import CoreBluetooth
import ExpoModulesCore
import libepos2

private final class BluetoothPermissionDelegate: NSObject, CBCentralManagerDelegate {
  weak var module: ReactNativeEscPosPrinterModule?

  init(module: ReactNativeEscPosPrinterModule) {
    self.module = module
  }

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    module?.didUpdateBluetoothAuthorization()
  }
}

private final class DiscoveryDelegate: NSObject, Epos2DiscoveryDelegate {
  weak var module: ReactNativeEscPosPrinterModule?

  init(module: ReactNativeEscPosPrinterModule) {
    self.module = module
  }

  func onDiscovery(_ deviceInfo: Epos2DeviceInfo!) {
    module?.didDiscover(deviceInfo)
  }
}

private final class SendReceiveDelegate: NSObject, Epos2PtrReceiveDelegate {
  weak var session: PrinterSession?

  func onPtrReceive(
    _ printerObj: Epos2Printer!,
    code: Int32,
    status: Epos2PrinterStatusInfo!,
    printJobId: String!
  ) {
    session?.didReceive(code: code, status: status)
  }
}

private final class PrinterSession {
  let printer: Epos2Printer
  let lock = NSLock()
  let receiveDelegate = SendReceiveDelegate()
  var isConnected = false
  var isClosed = false
  var sendSemaphore: DispatchSemaphore?
  var sendCode: Int32 = EPOS2_CODE_ERR_FAILURE.rawValue
  var sendStatus: Epos2PrinterStatusInfo?

  init?(deviceName: String, lang: Int) {
    guard let printer = Epos2Printer(
      printerSeries: printerSeries(for: deviceName),
      lang: Int32(lang)
    ) else {
      return nil
    }
    self.printer = printer
    receiveDelegate.session = self
  }

  func didReceive(code: Int32, status: Epos2PrinterStatusInfo?) {
    sendCode = code
    sendStatus = status
    sendSemaphore?.signal()
  }
}

public class ReactNativeEscPosPrinterModule: Module {
  private lazy var bluetoothDelegate = BluetoothPermissionDelegate(module: self)
  private lazy var discoveryDelegate = DiscoveryDelegate(module: self)
  private var bluetoothManager: CBCentralManager?
  private var permissionPromises: [Promise] = []
  private var printerSessions: [String: PrinterSession] = [:]
  private let printerSessionLock = NSLock()
  private var isDestroyed = false

  public func definition() -> ModuleDefinition {
    Name("ReactNativeEscPosPrinter")

    Events("onDiscovery", "onStatusChange", "onError")

    OnDestroy {
      _ = Epos2Discovery.stop()
      printerSessionLock.lock()
      isDestroyed = true
      let sessions = Array(printerSessions.values)
      printerSessions.removeAll()
      printerSessionLock.unlock()
      for session in sessions {
        session.sendSemaphore?.signal()
        session.lock.lock()
        _ = disconnectUntilSettled(session)
        session.printer.setReceiveEventDelegate(nil)
        session.isConnected = false
        session.isClosed = true
        session.lock.unlock()
      }
    }

    AsyncFunction("getDiscoveryPermissions") {
      return Self.discoveryPermissionResponse()
    }

    AsyncFunction("requestDiscoveryPermissions") { (promise: Promise) in
      guard CBCentralManager.authorization == .notDetermined else {
        promise.resolve(Self.discoveryPermissionResponse())
        return
      }

      permissionPromises.append(promise)
      if bluetoothManager == nil {
        bluetoothManager = CBCentralManager(delegate: bluetoothDelegate, queue: .main)
      }
    }

    Function("startDiscovery") { () -> Int in
      let result = Epos2Discovery.start(Epos2FilterOption(), delegate: discoveryDelegate)
      if result == EPOS2_SUCCESS.rawValue {
        sendEvent("onStatusChange", ["status": "discovering"])
      } else {
        sendDiscoveryError(result, methodName: "start")
      }
      return Int(result)
    }

    Function("stopDiscovery") { () -> Int in
      let result = self.stopDiscoveryUntilSettled()
      if result == EPOS2_SUCCESS.rawValue {
        sendEvent("onStatusChange", ["status": "inactive"])
      } else {
        sendDiscoveryError(result, methodName: "stop")
      }
      return Int(result)
    }

    AsyncFunction("connectPrinter") { (target: String, deviceName: String, lang: Int, timeout: Int) -> Int in
      return Int(self.connectPrinter(target: target, deviceName: deviceName, lang: lang, timeout: timeout))
    }

    AsyncFunction("disconnectPrinter") { (target: String) -> Int in
      return Int(self.disconnectPrinter(target: target))
    }

    AsyncFunction("getPrinterStatus") { (target: String, deviceName: String, lang: Int) -> [String: Int] in
      return self.printerStatus(target: target, deviceName: deviceName, lang: lang)
    }

    AsyncFunction("addText") { (target: String, text: String) -> Int in
      return Int(self.printerCommand(target) { $0.addText(text) })
    }

    AsyncFunction("addTextAlign") { (target: String, align: Int) -> Int in
      return Int(self.printerCommand(target) { $0.addTextAlign(Int32(align)) })
    }

    AsyncFunction("addTextSize") { (target: String, width: Int, height: Int) -> Int in
      return Int(self.printerCommand(target) { $0.addTextSize(width, height: height) })
    }

    AsyncFunction("addTextStyle") { (target: String, reverse: Int, ul: Int, em: Int, color: Int) -> Int in
      return Int(self.printerCommand(target) { $0.addTextStyle(Int32(reverse), ul: Int32(ul), em: Int32(em), color: Int32(color)) })
    }

    AsyncFunction("addTextLang") { (target: String, lang: Int) -> Int in
      return Int(self.printerCommand(target) { $0.addTextLang(Int32(lang)) })
    }

    AsyncFunction("addTextSmooth") { (target: String, smooth: Int) -> Int in
      return Int(self.printerCommand(target) { $0.addTextSmooth(Int32(smooth)) })
    }

    AsyncFunction("addFeedLine") { (target: String, lines: Int) -> Int in
      return Int(self.printerCommand(target) { $0.addFeedLine(lines) })
    }

    AsyncFunction("addLineSpace") { (target: String, space: Int) -> Int in
      return Int(self.printerCommand(target) { $0.addLineSpace(space) })
    }

    AsyncFunction("addCut") { (target: String, type: Int) -> Int in
      return Int(self.printerCommand(target) { $0.addCut(Int32(type)) })
    }

    AsyncFunction("sendPrinterData") { (target: String, timeout: Int) -> [String: Any] in
      return self.sendPrinterData(target: target, timeout: timeout)
    }

    AsyncFunction("clearCommandBuffer") { (target: String) -> Int in
      return Int(self.clearCommandBuffer(target: target))
    }
  }

  fileprivate func didUpdateBluetoothAuthorization() {
    guard CBCentralManager.authorization != .notDetermined else {
      return
    }

    let response = Self.discoveryPermissionResponse()
    for promise in permissionPromises {
      promise.resolve(response)
    }
    permissionPromises.removeAll()
    bluetoothManager = nil
  }

  fileprivate func didDiscover(_ deviceInfo: Epos2DeviceInfo!) {
    sendEvent("onDiscovery", [
      "target": deviceInfo.target ?? "",
      "deviceName": deviceInfo.deviceName ?? "",
      "deviceType": Int(deviceInfo.deviceType),
      "ipAddress": deviceInfo.ipAddress ?? "",
      "macAddress": deviceInfo.macAddress ?? "",
      "bdAddress": deviceInfo.bdAddress ?? "",
    ])
  }

  private static func discoveryPermissionResponse() -> [String: Any] {
    let status: String
    switch CBCentralManager.authorization {
    case .allowedAlways:
      status = "granted"
    case .notDetermined:
      status = "undetermined"
    default:
      status = "denied"
    }

    return [
      "status": status,
      "granted": status == "granted",
      "canAskAgain": status == "undetermined",
      "expires": "never",
    ]
  }

  private func stopDiscoveryUntilSettled() -> Int32 {
    var result = Epos2Discovery.stop()
    var remainingAttempts = 20
    while result == EPOS2_ERR_PROCESSING.rawValue && remainingAttempts > 0 {
      Thread.sleep(forTimeInterval: 0.05)
      result = Epos2Discovery.stop()
      remainingAttempts -= 1
    }
    return result
  }

  private func sendDiscoveryError(_ code: Int32, methodName: String) {
    sendEvent("onError", [
      "status": Int(code),
      "methodName": methodName,
    ])
  }

  private func stopDiscoveryQuietly() {
    let result = stopDiscoveryUntilSettled()
    if result == EPOS2_SUCCESS.rawValue {
      sendEvent("onStatusChange", ["status": "inactive"])
    }
  }

  private func session(target: String, deviceName: String, lang: Int) -> PrinterSession? {
    printerSessionLock.lock()
    defer { printerSessionLock.unlock() }
    if isDestroyed {
      return nil
    }
    if let existing = printerSessions[target] {
      return existing
    }
    guard let session = PrinterSession(deviceName: deviceName, lang: lang) else {
      return nil
    }
    printerSessions[target] = session
    return session
  }

  private func connectPrinter(target: String, deviceName: String, lang: Int, timeout: Int) -> Int32 {
    stopDiscoveryQuietly()
    guard let session = session(target: target, deviceName: deviceName, lang: lang) else {
      printerSessionLock.lock()
      let destroyed = isDestroyed
      printerSessionLock.unlock()
      return destroyed ? EPOS2_ERR_ILLEGAL.rawValue : EPOS2_ERR_MEMORY.rawValue
    }
    session.lock.lock()
    defer { session.lock.unlock() }
    if session.isClosed {
      return EPOS2_ERR_ILLEGAL.rawValue
    }
    if session.isConnected {
      return EPOS2_SUCCESS.rawValue
    }
    let result = session.printer.connect(target, timeout: timeout)
    if result == EPOS2_SUCCESS.rawValue {
      session.isConnected = true
    }
    return result
  }

  private func disconnectPrinter(target: String) -> Int32 {
    printerSessionLock.lock()
    let session = printerSessions[target]
    printerSessionLock.unlock()
    guard let session else {
      return EPOS2_SUCCESS.rawValue
    }
    session.lock.lock()
    defer { session.lock.unlock() }
    if !session.isConnected {
      return EPOS2_SUCCESS.rawValue
    }
    let result = disconnectUntilSettled(session)
    if result == EPOS2_SUCCESS.rawValue || result == EPOS2_ERR_ILLEGAL.rawValue {
      session.isConnected = false
      _ = session.printer.clearCommandBuffer()
      return EPOS2_SUCCESS.rawValue
    }
    return result
  }

  private func disconnectUntilSettled(_ session: PrinterSession) -> Int32 {
    var result = session.printer.disconnect()
    var remainingAttempts = 20
    while result == EPOS2_ERR_PROCESSING.rawValue && remainingAttempts > 0 {
      Thread.sleep(forTimeInterval: 0.5)
      result = session.printer.disconnect()
      remainingAttempts -= 1
    }
    return result
  }

  private func printerStatus(target: String, deviceName: String, lang: Int) -> [String: Int] {
    guard let session = session(target: target, deviceName: deviceName, lang: lang) else {
      return unknownPrinterStatus()
    }
    session.lock.lock()
    defer { session.lock.unlock() }
    guard let status = session.printer.getStatus() else {
      return unknownPrinterStatus()
    }
    return [
      "connection": Int(status.connection),
      "online": Int(status.online),
      "coverOpen": Int(status.coverOpen),
      "paper": Int(status.paper),
      "errorStatus": Int(status.errorStatus),
    ]
  }

  private func printerCommand(_ target: String, _ body: (Epos2Printer) -> Int32) -> Int32 {
    printerSessionLock.lock()
    let session = printerSessions[target]
    printerSessionLock.unlock()
    guard let session else {
      return EPOS2_ERR_ILLEGAL.rawValue
    }
    session.lock.lock()
    defer { session.lock.unlock() }
    if session.isClosed {
      return EPOS2_ERR_ILLEGAL.rawValue
    }
    return body(session.printer)
  }

  private func clearCommandBuffer(target: String) -> Int32 {
    printerSessionLock.lock()
    let session = printerSessions[target]
    printerSessionLock.unlock()
    guard let session else {
      return EPOS2_SUCCESS.rawValue
    }
    session.lock.lock()
    defer { session.lock.unlock() }
    if session.isClosed {
      return EPOS2_SUCCESS.rawValue
    }
    return session.printer.clearCommandBuffer()
  }

  private func sendPrinterData(target: String, timeout: Int) -> [String: Any] {
    printerSessionLock.lock()
    let session = printerSessions[target]
    printerSessionLock.unlock()
    guard let session else {
      return sendResult(EPOS2_ERR_ILLEGAL.rawValue, resultKind: "error")
    }

    session.lock.lock()
    if session.isClosed || !session.isConnected {
      session.lock.unlock()
      return sendResult(EPOS2_ERR_ILLEGAL.rawValue, resultKind: "error")
    }
    let begin = session.printer.beginTransaction()
    if begin != EPOS2_SUCCESS.rawValue {
      session.lock.unlock()
      return sendResult(begin, resultKind: "error")
    }
    let semaphore = DispatchSemaphore(value: 0)
    session.sendSemaphore = semaphore
    session.sendCode = EPOS2_CODE_ERR_FAILURE.rawValue
    session.sendStatus = nil
    session.printer.setReceiveEventDelegate(session.receiveDelegate)
    let sent = session.printer.sendData(timeout)
    if sent != EPOS2_SUCCESS.rawValue {
      _ = session.printer.endTransaction()
      _ = session.printer.clearCommandBuffer()
      session.printer.setReceiveEventDelegate(nil)
      session.sendSemaphore = nil
      session.lock.unlock()
      return sendResult(sent, resultKind: "error")
    }
    session.lock.unlock()

    let waitSeconds = TimeInterval((timeout < 0 ? 10_000 : timeout) + 2_000) / 1000.0
    let timedOut = semaphore.wait(timeout: .now() + waitSeconds) == .timedOut

    session.lock.lock()
    _ = session.printer.endTransaction()
    _ = session.printer.clearCommandBuffer()
    session.printer.setReceiveEventDelegate(nil)
    session.sendSemaphore = nil
    if timedOut {
      session.lock.unlock()
      return sendResult(EPOS2_CODE_ERR_TIMEOUT.rawValue, resultKind: "code")
    }
    let code = session.sendCode
    let status = session.sendStatus
    session.lock.unlock()
    guard let status else {
      return sendResult(code, resultKind: "code")
    }
    return sendResult(
      code,
      resultKind: "code",
      connection: Int(status.connection),
      online: Int(status.online),
      coverOpen: Int(status.coverOpen),
      paper: Int(status.paper),
      errorStatus: Int(status.errorStatus)
    )
  }
}

private func unknownPrinterStatus() -> [String: Int] {
  [
    "connection": 0,
    "online": -3,
    "coverOpen": -3,
    "paper": -3,
    "errorStatus": -3,
  ]
}

private func sendResult(
  _ result: Int32,
  resultKind: String,
  connection: Int = 0,
  online: Int = -3,
  coverOpen: Int = -3,
  paper: Int = -3,
  errorStatus: Int = -3
) -> [String: Any] {
  [
    "result": Int(result),
    "resultKind": resultKind,
    "connection": connection,
    "online": online,
    "coverOpen": coverOpen,
    "paper": paper,
    "errorStatus": errorStatus,
  ]
}

private func printerSeries(for deviceName: String) -> Int32 {
  let mapping: [(String, Epos2PrinterSeries)] = [
    ("TM-m30III", EPOS2_TM_M30III),
    ("TM-m30II", EPOS2_TM_M30II),
    ("TM-m30", EPOS2_TM_M30),
    ("TM-m50II", EPOS2_TM_M50II),
    ("TM-m50", EPOS2_TM_M50),
    ("TM-m55", EPOS2_TM_M55),
    ("TM-m10", EPOS2_TM_M10),
    ("TM-P20II", EPOS2_TM_P20II),
    ("TM-P20", EPOS2_TM_P20),
    ("TM-P60II", EPOS2_TM_P60II),
    ("TM-P60", EPOS2_TM_P60),
    ("TM-P80II", EPOS2_TM_P80II),
    ("TM-P80", EPOS2_TM_P80),
    ("TM-T83III", EPOS2_TM_T83III),
    ("TM-T83", EPOS2_TM_T83),
    ("TM-T88VII", EPOS2_TM_T88VII),
    ("TM-T88", EPOS2_TM_T88),
    ("TM-T90KP", EPOS2_TM_T90KP),
    ("TM-T90", EPOS2_TM_T90),
    ("TM-T100", EPOS2_TM_T100),
    ("TM-T20", EPOS2_TM_T20),
    ("TM-T60", EPOS2_TM_T60),
    ("TM-T70", EPOS2_TM_T70),
    ("TM-T81", EPOS2_TM_T81),
    ("TM-T82", EPOS2_TM_T82),
    ("TM-U220II", EPOS2_TM_U220II),
    ("TM-U220", EPOS2_TM_U220),
    ("TM-U330", EPOS2_TM_U330),
    ("TM-L90LFC", EPOS2_TM_L90LFC),
    ("TM-L90", EPOS2_TM_L90),
    ("TM-L100", EPOS2_TM_L100),
    ("TM-H6000", EPOS2_TM_H6000),
    ("SB-H50", EPOS2_SB_H50),
    ("SB-M30", EPOS2_SB_M30),
  ]
  for (prefix, series) in mapping {
    if deviceName.hasPrefix(prefix) {
      return series.rawValue
    }
  }
  return EPOS2_TM_T88.rawValue
}
