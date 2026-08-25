# One Printer Instance Per Target

`new Printer({ target, deviceName })` returns the same instance when `target` matches. Two JavaScript queues must not sit on one native Command Buffer. Construction takes `target`, `deviceName`, and optional `lang`; series is inferred from Device Name. Callers do not pass Epson series integers.
