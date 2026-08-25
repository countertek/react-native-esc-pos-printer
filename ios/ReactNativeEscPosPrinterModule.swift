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

public class ReactNativeEscPosPrinterModule: Module {
  private lazy var bluetoothDelegate = BluetoothPermissionDelegate(module: self)
  private lazy var discoveryDelegate = DiscoveryDelegate(module: self)
  private var bluetoothManager: CBCentralManager?
  private var permissionPromises: [Promise] = []

  public func definition() -> ModuleDefinition {
    Name("ReactNativeEscPosPrinter")

    Events("onDiscovery", "onStatusChange", "onError")

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
}
