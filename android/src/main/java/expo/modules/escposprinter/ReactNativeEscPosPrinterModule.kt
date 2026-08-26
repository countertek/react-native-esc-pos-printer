package expo.modules.escposprinter

import android.Manifest
import android.os.Build
import androidx.core.os.bundleOf
import com.epson.epos2.Epos2Exception
import com.epson.epos2.discovery.DeviceInfo
import com.epson.epos2.discovery.Discovery
import com.epson.epos2.discovery.DiscoveryListener
import com.epson.epos2.discovery.FilterOption
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ReactNativeEscPosPrinterModule : Module() {
  private val discoveryListener = DiscoveryListener { deviceInfo ->
    sendEvent(
      "onDiscovery",
      bundleOf(
        "target" to deviceInfo.target,
        "deviceName" to deviceInfo.deviceName,
        "deviceType" to deviceInfo.deviceType,
        "ipAddress" to deviceInfo.ipAddress,
        "macAddress" to deviceInfo.macAddress,
        "bdAddress" to deviceInfo.bdAddress
      )
    )
  }

  override fun definition() = ModuleDefinition {
    Name("ReactNativeEscPosPrinter")

    Events("onDiscovery", "onStatusChange", "onError")

    OnDestroy {
      try {
        Discovery.stop()
      } catch (_: Epos2Exception) {
      }
    }

    AsyncFunction("getDiscoveryPermissions") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        *discoveryPermissions()
      )
    }

    AsyncFunction("requestDiscoveryPermissions") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        *discoveryPermissions()
      )
    }

    Function("startDiscovery") {
      try {
        Discovery.start(
          requireNotNull(appContext.reactContext),
          FilterOption(),
          discoveryListener
        )
        sendEvent("onStatusChange", bundleOf("status" to "discovering"))
        0
      } catch (error: Epos2Exception) {
        sendDiscoveryError(error, "start")
        error.errorStatus
      }
    }

    Function("stopDiscovery") {
      try {
        stopDiscoveryUntilSettled()
        sendEvent("onStatusChange", bundleOf("status" to "inactive"))
        0
      } catch (error: Epos2Exception) {
        sendDiscoveryError(error, "stop")
        error.errorStatus
      }
    }
  }

  private fun stopDiscoveryUntilSettled() {
    var remainingAttempts = 20
    while (true) {
      try {
        Discovery.stop()
        return
      } catch (error: Epos2Exception) {
        if (error.errorStatus != Epos2Exception.ERR_PROCESSING || remainingAttempts == 0) {
          throw error
        }
        remainingAttempts -= 1
        Thread.sleep(50)
      }
    }
  }

  private fun discoveryPermissions(): Array<String> = when {
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> arrayOf(
      Manifest.permission.BLUETOOTH_SCAN,
      Manifest.permission.BLUETOOTH_CONNECT
    )
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q -> arrayOf(
      Manifest.permission.ACCESS_FINE_LOCATION
    )
    else -> arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION)
  }

  private fun sendDiscoveryError(error: Epos2Exception, methodName: String) {
    sendEvent(
      "onError",
      bundleOf(
        "status" to error.errorStatus,
        "methodName" to methodName
      )
    )
  }
}
