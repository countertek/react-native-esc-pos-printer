# Use A Long-Lived Printer Session And Run For Print Jobs

A Printer stays connected across receipts. `connect` and `disconnect` are explicit session operations. Callers print with `printer.run(async (buffer) => { … })`. `run` passes a Command Buffer; `add*` and `sendData` are not methods on Printer. Jobs are serialized so Command Buffers do not interleave. There is no public `addQueueTask`. Epson `beginTransaction` / `endTransaction` stay inside send, not on the public interface. If `run` exits without a successful send, the Command Buffer is cleared.
