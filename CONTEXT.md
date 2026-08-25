# ESC/POS Printer

This context describes the public language for the Expo module that discovers Epson TM receipt printers and prints receipts on them.

## Language

**Printer**:
An Epson TM receipt printer this library can discover, connect to, and print on. One JavaScript instance exists per Target.
_Avoid_: device, terminal, reader

**Target**:
The Epson connection address for a Printer, such as `TCP:192.168.1.50`, `BT:00:22:15:7D:70:9C`, or `USB:`.
_Avoid_: id, uri, address (alone)

**Device Name**:
The model name Discovery reports (for example `TM-T88V`). The native wrapper infers Epson series from it.
_Avoid_: series, model id

**Discovery**:
Finding Printers on Bluetooth, LAN, Wi-Fi, or USB.
_Avoid_: scan, search

**Command Buffer**:
The pending receipt contents held for a connected Printer until they are sent to paper. Public `add*` and `sendData` live only on the Command Buffer object passed into `run`.
_Avoid_: queue, job (those are serialization of work, not the receipt bytes)

**Print Job**:
One exclusive unit of work against a connected Printer's Command Buffer. Other jobs on the same Printer wait. Connect and disconnect are session operations, not part of the job.
_Avoid_: task, queue item, addQueueTask

**Printer Status**:
The connection, online, cover, paper, and error state of a Printer from `getStatus` or a successful send.
_Avoid_: battery, drawer, buzzer, and other deferred sensor fields
