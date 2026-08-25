# Put Command Buffer Methods Only On The Run Callback Object

`addText`, the rest of the text family, `addCut`, and `sendData` are methods on the Command Buffer passed to `printer.run`, not on `Printer`. `Printer` exposes `connect`, `disconnect`, `run`, and `getStatus`. That makes “no `add*` outside a Print Job” a type-level invariant, not a convention.
