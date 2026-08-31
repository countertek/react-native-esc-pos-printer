# Use TypeScript Constants Instead Of A Native Constant Dump

First-slice values (TRUE/FALSE, `ALIGN_*`, `CUT_*`, `COLOR_*`, `MODEL_*`, `LANG_*`, `PARAM_*`) are TypeScript enums in the package. Native `getConstants()` is not part of the interface. Image, barcode, and other Epson enums wait with those features.
