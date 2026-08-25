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
  private var permissionPromise: Promise?

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

      permissionPromise = promise
      bluetoothManager = CBCentralManager(delegate: bluetoothDelegate, queue: .main)
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
      let result = Epos2Discovery.stop()
      if result == EPOS2_SUCCESS.rawValue {
        sendEvent("onStatusChange", ["status": "inactive"])
      } else {
        sendDiscoveryError(result, methodName: "stop")
      }
      return Int(result)
    }
  }

  fileprivate func didUpdateBluetoothAuthorization() {
    guard
      let promise = permissionPromise,
      CBCentralManager.authorization != .notDetermined
    else {
      return
    }

    promise.resolve(Self.discoveryPermissionResponse())
    permissionPromise = nil
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

  private func sendDiscoveryError(_ code: Int32, methodName: String) {
    sendEvent("onError", [
      "status": Int(code),
      "methodName": methodName,
    ])
  }
}
