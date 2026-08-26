package expo.modules.escposprinter

import android.Manifest
import android.os.Build
import androidx.core.os.bundleOf
import com.epson.epos2.Epos2Exception
import com.epson.epos2.discovery.DeviceInfo
import com.epson.epos2.discovery.Discovery
import com.epson.epos2.discovery.DiscoveryListener
import com.epson.epos2.discovery.FilterOption
import com.epson.epos2.printer.Printer as EpsonPrinter
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private class PrinterSession(val printer: EpsonPrinter) {
  var isConnected = false
  var isClosed = false
}

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
  private val printerSessions = mutableMapOf<String, PrinterSession>()

  override fun definition() = ModuleDefinition {
    Name("ReactNativeEscPosPrinter")

    Events("onDiscovery", "onStatusChange", "onError")

    OnDestroy {
      try {
        Discovery.stop()
      } catch (_: Epos2Exception) {
      }
      val sessions = synchronized(printerSessions) {
        val snapshot = printerSessions.values.toList()
        printerSessions.clear()
        snapshot
      }
      for (session in sessions) {
        synchronized(session) {
          try {
            disconnectUntilSettled(session)
          } catch (_: Epos2Exception) {
          }
          session.isConnected = false
          session.isClosed = true
        }
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

    AsyncFunction("connectPrinter") { target: String, deviceName: String, lang: Int, timeout: Int ->
      connectPrinter(target, deviceName, lang, timeout)
    }

    AsyncFunction("disconnectPrinter") { target: String ->
      disconnectPrinter(target)
    }

    AsyncFunction("getPrinterStatus") { target: String, deviceName: String, lang: Int ->
      printerStatus(target, deviceName, lang)
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

  private fun session(target: String, deviceName: String, lang: Int): PrinterSession {
    synchronized(printerSessions) {
      printerSessions[target]?.let { return it }
      val context = requireNotNull(appContext.reactContext)
      val session = PrinterSession(EpsonPrinter(printerSeries(deviceName), lang, context))
      printerSessions[target] = session
      return session
    }
  }

  private fun connectPrinter(target: String, deviceName: String, lang: Int, timeout: Int): Int {
    val session = try {
      session(target, deviceName, lang)
    } catch (_: Epos2Exception) {
      return Epos2Exception.ERR_MEMORY
    }
    synchronized(session) {
      if (session.isClosed) {
        return Epos2Exception.ERR_ILLEGAL
      }
      if (session.isConnected) {
        return 0
      }
      return try {
        session.printer.connect(target, timeout)
        session.isConnected = true
        0
      } catch (error: Epos2Exception) {
        error.errorStatus
      }
    }
  }

  private fun disconnectPrinter(target: String): Int {
    val session = synchronized(printerSessions) { printerSessions[target] } ?: return 0
    synchronized(session) {
      if (!session.isConnected) {
        return 0
      }
      return try {
        disconnectUntilSettled(session)
        session.printer.clearCommandBuffer()
        session.isConnected = false
        0
      } catch (error: Epos2Exception) {
        if (error.errorStatus == Epos2Exception.ERR_ILLEGAL) {
          session.isConnected = false
          0
        } else {
          error.errorStatus
        }
      }
    }
  }

  private fun disconnectUntilSettled(session: PrinterSession) {
    var remainingAttempts = 20
    while (true) {
      try {
        session.printer.disconnect()
        return
      } catch (error: Epos2Exception) {
        if (error.errorStatus != Epos2Exception.ERR_PROCESSING || remainingAttempts == 0) {
          throw error
        }
        remainingAttempts -= 1
        Thread.sleep(500)
      }
    }
  }

  private fun printerStatus(target: String, deviceName: String, lang: Int): Map<String, Int> {
    val session = try {
      session(target, deviceName, lang)
    } catch (_: Epos2Exception) {
      return mapOf(
        "connection" to 0,
        "online" to -3,
        "coverOpen" to -3,
        "paper" to -3,
        "errorStatus" to -3
      )
    }
    synchronized(session) {
      val status = session.printer.status
      return mapOf(
        "connection" to status.connection,
        "online" to status.online,
        "coverOpen" to status.coverOpen,
        "paper" to status.paper,
        "errorStatus" to status.errorStatus
      )
    }
  }
}

private fun printerSeries(deviceName: String): Int {
  val mapping = listOf(
    "TM-m30III" to EpsonPrinter.TM_M30III,
    "TM-m30II" to EpsonPrinter.TM_M30II,
    "TM-m30" to EpsonPrinter.TM_M30,
    "TM-m50II" to EpsonPrinter.TM_M50II,
    "TM-m50" to EpsonPrinter.TM_M50,
    "TM-m55" to EpsonPrinter.TM_M55,
    "TM-m10" to EpsonPrinter.TM_M10,
    "TM-P20II" to EpsonPrinter.TM_P20II,
    "TM-P20" to EpsonPrinter.TM_P20,
    "TM-P60II" to EpsonPrinter.TM_P60II,
    "TM-P60" to EpsonPrinter.TM_P60,
    "TM-P80II" to EpsonPrinter.TM_P80II,
    "TM-P80" to EpsonPrinter.TM_P80,
    "TM-T83III" to EpsonPrinter.TM_T83III,
    "TM-T83" to EpsonPrinter.TM_T83,
    "TM-T88VII" to EpsonPrinter.TM_T88VII,
    "TM-T88" to EpsonPrinter.TM_T88,
    "TM-T90KP" to EpsonPrinter.TM_T90KP,
    "TM-T90" to EpsonPrinter.TM_T90,
    "TM-T100" to EpsonPrinter.TM_T100,
    "TM-T20" to EpsonPrinter.TM_T20,
    "TM-T60" to EpsonPrinter.TM_T60,
    "TM-T70" to EpsonPrinter.TM_T70,
    "TM-T81" to EpsonPrinter.TM_T81,
    "TM-T82" to EpsonPrinter.TM_T82,
    "TM-U220II" to EpsonPrinter.TM_U220II,
    "TM-U220" to EpsonPrinter.TM_U220,
    "TM-U330" to EpsonPrinter.TM_U330,
    "TM-L90LFC" to EpsonPrinter.TM_L90LFC,
    "TM-L90" to EpsonPrinter.TM_L90,
    "TM-L100" to EpsonPrinter.TM_L100,
    "TM-H6000" to EpsonPrinter.TM_H6000,
    "SB-H50" to EpsonPrinter.SB_H50,
    "SB-M30" to EpsonPrinter.SB_M30
  )
  return mapping.firstOrNull { deviceName.startsWith(it.first) }?.second ?: EpsonPrinter.TM_T88
}
