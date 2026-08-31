package expo.modules.escposprinter

import android.Manifest
import android.os.Build
import androidx.core.os.bundleOf
import com.epson.epos2.Epos2CallbackCode
import com.epson.epos2.Epos2Exception
import com.epson.epos2.discovery.Discovery
import com.epson.epos2.discovery.DiscoveryListener
import com.epson.epos2.discovery.FilterOption
import com.epson.epos2.printer.Printer as EpsonPrinter
import com.epson.epos2.printer.PrinterStatusInfo
import com.epson.epos2.printer.ReceiveListener
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

private class PrinterSession(val printer: EpsonPrinter) : ReceiveListener {
  var isConnected = false
  var isClosed = false
  @Volatile var sendLatch: CountDownLatch? = null
  @Volatile var sendCode: Int = Epos2CallbackCode.CODE_ERR_FAILURE
  @Volatile var sendStatus: PrinterStatusInfo? = null

  override fun onPtrReceive(
    printer: EpsonPrinter?,
    code: Int,
    status: PrinterStatusInfo?,
    printJobId: String?
  ) {
    sendCode = code
    sendStatus = status
    sendLatch?.countDown()
  }
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
  private var isDestroyed = false

  override fun definition() = ModuleDefinition {
    Name("ReactNativeEscPosPrinter")

    Events("onDiscovery", "onStatusChange", "onError")

    OnDestroy {
      try {
        Discovery.stop()
      } catch (_: Epos2Exception) {
      }
      val sessions = synchronized(printerSessions) {
        isDestroyed = true
        val snapshot = printerSessions.values.toList()
        printerSessions.clear()
        snapshot
      }
      for (session in sessions) {
        session.sendLatch?.countDown()
        synchronized(session) {
          try {
            disconnectUntilSettled(session)
          } catch (_: Epos2Exception) {
          }
          session.printer.setReceiveEventListener(null)
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

    AsyncFunction("addText") { target: String, text: String ->
      printerCommand(target) { it.addText(text) }
    }

    AsyncFunction("addTextAlign") { target: String, align: Int ->
      printerCommand(target) { it.addTextAlign(align) }
    }

    AsyncFunction("addTextSize") { target: String, width: Int, height: Int ->
      printerCommand(target) { it.addTextSize(width, height) }
    }

    AsyncFunction("addTextStyle") { target: String, reverse: Int, ul: Int, em: Int, color: Int ->
      printerCommand(target) { it.addTextStyle(reverse, ul, em, color) }
    }

    AsyncFunction("addTextLang") { target: String, lang: Int ->
      printerCommand(target) { it.addTextLang(lang) }
    }

    AsyncFunction("addTextSmooth") { target: String, smooth: Int ->
      printerCommand(target) { it.addTextSmooth(smooth) }
    }

    AsyncFunction("addFeedLine") { target: String, lines: Int ->
      printerCommand(target) { it.addFeedLine(lines) }
    }

    AsyncFunction("addLineSpace") { target: String, space: Int ->
      printerCommand(target) { it.addLineSpace(space) }
    }

    AsyncFunction("addCut") { target: String, type: Int ->
      printerCommand(target) { it.addCut(type) }
    }

    AsyncFunction("sendPrinterData") { target: String, timeout: Int ->
      sendPrinterData(target, timeout)
    }

    AsyncFunction("clearCommandBuffer") { target: String ->
      clearCommandBuffer(target)
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

  private fun stopDiscoveryQuietly() {
    try {
      stopDiscoveryUntilSettled()
      sendEvent("onStatusChange", bundleOf("status" to "inactive"))
    } catch (_: Epos2Exception) {
    }
  }

  private fun session(target: String, deviceName: String, lang: Int): PrinterSession? {
    synchronized(printerSessions) {
      if (isDestroyed) {
        return null
      }
      printerSessions[target]?.let { return it }
      val context = requireNotNull(appContext.reactContext)
      val session = PrinterSession(EpsonPrinter(printerSeries(deviceName), lang, context))
      printerSessions[target] = session
      return session
    }
  }

  private fun connectPrinter(target: String, deviceName: String, lang: Int, timeout: Int): Int {
    stopDiscoveryQuietly()
    val session = try {
      session(target, deviceName, lang) ?: return Epos2Exception.ERR_ILLEGAL
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
      session(target, deviceName, lang) ?: return unknownPrinterStatus()
    } catch (_: Epos2Exception) {
      return unknownPrinterStatus()
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

  private fun printerCommand(target: String, block: (EpsonPrinter) -> Unit): Int {
    val session = synchronized(printerSessions) { printerSessions[target] }
      ?: return Epos2Exception.ERR_ILLEGAL
    synchronized(session) {
      if (session.isClosed) {
        return Epos2Exception.ERR_ILLEGAL
      }
      return try {
        block(session.printer)
        0
      } catch (error: Epos2Exception) {
        error.errorStatus
      }
    }
  }

  private fun clearCommandBuffer(target: String): Int {
    val session = synchronized(printerSessions) { printerSessions[target] } ?: return 0
    synchronized(session) {
      if (session.isClosed) {
        return 0
      }
      session.printer.clearCommandBuffer()
      return 0
    }
  }

  private fun sendPrinterData(target: String, timeout: Int): Map<String, Any> {
    val session = synchronized(printerSessions) { printerSessions[target] }
      ?: return sendResult(Epos2Exception.ERR_ILLEGAL, "error")

    val latch: CountDownLatch
    synchronized(session) {
      if (session.isClosed || !session.isConnected) {
        return sendResult(Epos2Exception.ERR_ILLEGAL, "error")
      }
      try {
        session.printer.beginTransaction()
      } catch (error: Epos2Exception) {
        return sendResult(error.errorStatus, "error")
      }
      latch = CountDownLatch(1)
      session.sendLatch = latch
      session.sendCode = Epos2CallbackCode.CODE_ERR_FAILURE
      session.sendStatus = null
      session.printer.setReceiveEventListener(session)
      try {
        session.printer.sendData(timeout)
      } catch (error: Epos2Exception) {
        try {
          session.printer.endTransaction()
        } catch (_: Epos2Exception) {
        }
        session.printer.clearCommandBuffer()
        session.printer.setReceiveEventListener(null)
        session.sendLatch = null
        return sendResult(error.errorStatus, "error")
      }
    }

    val waitMs = (if (timeout < 0) 10_000 else timeout).toLong() + 2_000
    val completed = latch.await(waitMs, TimeUnit.MILLISECONDS)

    synchronized(session) {
      try {
        session.printer.endTransaction()
      } catch (_: Epos2Exception) {
      }
      session.printer.clearCommandBuffer()
      session.printer.setReceiveEventListener(null)
      session.sendLatch = null
      if (!completed) {
        return sendResult(Epos2CallbackCode.CODE_ERR_TIMEOUT, "code")
      }
      val status = session.sendStatus
      val code = session.sendCode
      if (status == null) {
        return sendResult(code, "code")
      }
      return sendResult(
        code,
        "code",
        status.connection,
        status.online,
        status.coverOpen,
        status.paper,
        status.errorStatus
      )
    }
  }
}

private fun unknownPrinterStatus(): Map<String, Int> = mapOf(
  "connection" to 0,
  "online" to -3,
  "coverOpen" to -3,
  "paper" to -3,
  "errorStatus" to -3
)

private fun sendResult(
  result: Int,
  resultKind: String,
  connection: Int = 0,
  online: Int = -3,
  coverOpen: Int = -3,
  paper: Int = -3,
  errorStatus: Int = -3
): Map<String, Any> = mapOf(
  "result" to result,
  "resultKind" to resultKind,
  "connection" to connection,
  "online" to online,
  "coverOpen" to coverOpen,
  "paper" to paper,
  "errorStatus" to errorStatus
)

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
