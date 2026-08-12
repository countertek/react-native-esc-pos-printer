# Upstream backlog triage

**Snapshot:** 2026-08-13  
**Upstream:** [`tr3v3r/react-native-esc-pos-printer`](https://github.com/tr3v3r/react-native-esc-pos-printer)  
**Fork:** [`countertek/react-native-esc-pos-printer`](https://github.com/countertek/react-native-esc-pos-printer)

## Summary and scope

The upstream backlog contains **24 open issues and 4 open pull requests**. Every open issue body/comment thread and every open PR body, changed-file list, and diff was reviewed; candidates were compared with upstream/fork `main`, the fork branches, and [fork PR #1](https://github.com/countertek/react-native-esc-pos-printer/pull/1). Fork `main` equals upstream commit [`461cd37`](https://github.com/tr3v3r/react-native-esc-pos-printer/commit/461cd37d0700a3da00069f4122173871c4056211). Hardware claims below are qualified when not verified in code.

## Maintenance evidence

The repository is not archived and the maintainer replied in [#243 on 2026-01-06](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/243), so “abandoned” is not a formal status. In practice, however:

- Last upstream commit: [`461cd37`, 2025-10-24](https://github.com/tr3v3r/react-native-esc-pos-printer/commit/461cd37d0700a3da00069f4122173871c4056211).
- Last release: [`v4.5.0`, published 2025-10-24](https://github.com/tr3v3r/react-native-esc-pos-printer/releases/tag/v4.5.0).
- [PR #241](https://github.com/tr3v3r/react-native-esc-pos-printer/pull/241) has had no activity since 2025-10-15; [PR #242](https://github.com/tr3v3r/react-native-esc-pos-printer/pull/242), opened 2025-12-26, has no review.
- Issues #245, #247, #248, #249, and #250 were opened between 2026-01-19 and 2026-06-14 without an upstream patch.

Conclusion: dormant maintenance, not a formally abandoned project—no commit or release for almost ten months and only sporadic issue engagement.

## P0 — adopt next

### [#224: illegal `p-queue` subpath](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/224)

- **Affected:** Android reports on RN 0.79/Expo/new architecture, library 4.4.1–4.5.0; shared JS means other bundlers may fail too.
- **Evidence:** current code uses [`require('p-queue/dist').default`](https://github.com/tr3v3r/react-native-esc-pos-printer/blob/461cd37d0700a3da00069f4122173871c4056211/package/src/printer/Printer.ts#L49-L54), while `p-queue@7.4.1` exports only its [package root](https://github.com/sindresorhus/p-queue/blob/v7.4.1/package.json#L7-L8). Four reporters; the latest confirms `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **Overlap/fork:** no duplicate; absent from fork `main` and PR #1.
- **Path:** import from the public root; verify Bob-built ESM and Metro consumption.
- **Risk/recommendation:** low risk/high value. **Adopt.** Verify CJS/ESM interop rather than blindly copying one syntax change.

### [#248](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/248) + [#232](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/232): harden iOS discovery

- **Affected:** #248: iOS 4.5.0, RN 0.81.5/Fabric, release, TM-m30III/LAN, intermittent `EXC_BAD_ACCESS`. #232: iOS 4.4.1/4.4.3, RN 0.78.2/Fabric, simulator/devices, blank `(NOBRIDGE) ERROR`.
- **Evidence:** current [`onDiscovery:`](https://github.com/tr3v3r/react-native-esc-pos-printer/blob/461cd37d0700a3da00069f4122173871c4056211/package/ios/EscPosPrinterDiscovery.mm#L109-L132) reads SDK-owned strings, creates an `NSDictionary` literal without nil coalescing, mutates `_printerList`, and emits that same mutable array. Dictionary literals reject nil; async bridge observation can race mutation. #248’s reporter says copying/locking/snapshotting fixed the crash. #232 commenters confirm `TYPE_PRINTER` avoids the error, plausibly because `TYPE_ALL` can expose non-printer devices with missing fields. Exact root causes were not independently reproduced.
- **Overlap/fork:** same callback surface, distinct regressions; #248 links closed #129. PR #1 touches the file only for pairing, not callback safety.
- **Path:** copy strings immediately, coalesce nil to `@""`, serialize list access with instance-owned synchronization, and emit an immutable snapshot on a safe/main queue. Preserve explicit `TYPE_ALL`; consider `TYPE_PRINTER` a safer default only with an override.
- **Risk/recommendation:** medium risk/crash payoff. **Adopt after concurrency review.** Do not paste the proposed process-global static lock verbatim.

### [#245](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/245) + [#234](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/234): generated-code compatibility

- **Affected:** #245: Android 4.5.0/RN 0.79/Fabric build failure at generated `target_compile_reactnative_options`. #234: Android 4.4.3/RN 0.79.2/Expo 53/Fabric release crash on 32-bit `armeabi-v7a` during discovery.
- **Evidence:** the package pins RN 0.81.1 and sets [`includesGeneratedCode: true`](https://github.com/tr3v3r/react-native-esc-pos-printer/blob/461cd37d0700a3da00069f4122173871c4056211/package/package.json#L162-L173). The published 4.5.0 [`CMakeLists.txt`](https://unpkg.com/react-native-esc-pos-printer@4.5.0/android/generated/jni/CMakeLists.txt) contains the exact macro rejected by RN 0.79. React Native’s [official warning](https://reactnative.dev/docs/the-new-architecture/codegen-cli#including-generated-code-into-libraries) says included output is based on the library RN version and can conflict with consumer RN versions. #234’s log also contains Reanimated symptoms; a commenter blames generated event emission, and the generated spec calls [`mEventEmitterCallback.invoke`](https://github.com/tr3v3r/react-native-esc-pos-printer/blob/461cd37d0700a3da00069f4122173871c4056211/package/android/src/oldarch/java/com/reactnativeescposprinter/NativeEscPosPrinterDiscoverySpec.java#L42-L44), but that root cause is unverified.
- **Overlap/fork:** #249 is the iOS/newer-RN mirror but already handled by PR #1. PR #1 does not fix these Android cases.
- **Path:** declare a supported RN range; either stop shipping generated output or generate/test against the supported minimum through maximum. Isolate #234 in a minimal 32-bit app without Reanimated.
- **Risk/recommendation:** high integration risk/systemic impact. **Adopt as one compatibility workstream; fix #245 and investigate #234.**

## Already covered by fork

### [#230](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/230): TM-m30 model ordering

Current Android checks [`TM-m30` before `TM-m30II/III`](https://github.com/tr3v3r/react-native-esc-pos-printer/blob/461cd37d0700a3da00069f4122173871c4056211/package/android/src/main/java/com/reactnativeescposprinter/EposStringHelper.java#L345-L354); iOS does the same, making specific branches unreachable. [Fork PR #1](https://github.com/countertek/react-native-esc-pos-printer/pull/1) reorders both. The issue reporter did not prove this caused their connection error; comments also mention permissions/Secure Printing. **Take the low-risk fork fix, but describe issue closure as plausible rather than proven.**

## P1

### [#243: 6–8 second `connect()` regression](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/243)

- **Affected:** Android/iOS 4.4.4–4.5.0 versus 4.3.3, RN 0.82.1/new architecture, real TCP printers.
- **Evidence:** minimal timing code and three corroborating users. The boundary is [`v4.4.4`, 2025-09-15](https://github.com/tr3v3r/react-native-esc-pos-printer/releases/tag/v4.4.4), whose substantive change is [native SDK 2.33.1](https://github.com/tr3v3r/react-native-esc-pos-printer/commit/8c640c13d98f926cdf8029d24e5284cb53edc21f). The bundled SDK [changelog](https://unpkg.com/react-native-esc-pos-printer-sdk@2.31.1/README.md) says Epson 2.33.1 added 16 KB page-size support. Epson now lists ePOS SDK 2.37.0a, dated 2026-06-29, on its [official support page](https://epson.com/Support/Point-of-Sale/Embedded-Units/Epson-EU-m30-Series/s/SPT_C31CK01001). Cause remains unverified.
- **Overlap/fork:** #184 is total image-print time; #185 is offline timeout. No fork fix.
- **Path/risk:** hardware A/B SDK 2.33.1 versus 2.37.0a under the identical wrapper/app/printer; if still needed, compare pre-4.4.4. Medium/high diagnostic risk; **prioritize reproduction and SDK evaluation, not timeout masking.**

### [#131: direct Bluetooth permissions](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/131)

Discovery calls an internal Android permission helper; direct connect does not. The proposed deep import is not a durable public API. This overlaps permission discussions in #226/#230/#233 but isolates direct-connect ownership. No fork fix. **Adopt after deciding the contract:** export a supported permission request/check API, or explicitly document caller ownership and required permissions.

## P2

### [#185: Android connect timeout](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/185)

Reported on 4.2.0/RN 0.72.6: `connect(1500)` allegedly waits 15 seconds with the printer off. Current JS/native layers pass the timeout to Epson; no omission is visible. Distinct from #243; no fork fix. **Investigate on the current SDK and each transport before wrapper cancellation; medium semantic risk.**

### [#250: paper-removal result](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/250)

The narrative says iOS 4.4.3/RN 0.83.6/Expo 55, TM-L90LFC TCP/Bluetooth; the template says Android. Exact `CODE_ERR_WAIT_REMOVAL`, one reporter/device. Current code already exposes `removalWaiting` and maps the result. Overlaps stale #105. **Hardware-investigate whether the job was accepted or rejected; never turn it into success without proof because of duplicate/data-loss risk.**

### [PR #241: page mode](https://github.com/tr3v3r/react-native-esc-pos-printer/pull/241)

22 files, +907/−1, Android-only native APIs plus shared TS/docs/example. The maintainer requested iOS support; the author could not provide/test it. No fork coverage. **Defer unless roadmap-required; use as Android reference, not a cherry-pick.**

## Explicit #249 exclusion

[#249 — RN 0.85/Expo 56 iOS generated `ResultT`](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/249) is **excluded because it is already addressed by [fork PR #1](https://github.com/countertek/react-native-esc-pos-printer/pull/1)**. Its broader lesson remains in #245/#234; do not adopt a duplicate patch.

## All open PRs accounted for

| PR | Evidence / overlap | Disposition |
|---|---|---|
| [#242](https://github.com/tr3v3r/react-native-esc-pos-printer/pull/242) | Renames the setter declaration but leaves `setIsDescovering(...)`, breaking the file. | **Reject; not mergeable as-is.** |
| [#241](https://github.com/tr3v3r/react-native-esc-pos-printer/pull/241) | Android-only page mode; no fork coverage. | **Defer; roadmap only.** |
| [#225](https://github.com/tr3v3r/react-native-esc-pos-printer/pull/225) | Old-layout, predominantly iOS scanner feature; no Android implementation, current-layout migration, tests, or docs; dirty against its base. | **Reject as-is.** |
| [#169](https://github.com/tr3v3r/react-native-esc-pos-printer/pull/169) | +5,180/−228 partial RN Windows 0.74-era port targeting a non-main branch; [#136](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/136) says only business-required features were built. | **Reject direct adoption; reference only if Windows is required.** |

## Remaining open issues accounted for

| Issue | Classification / overlap / fork status | Disposition |
|---|---|---|
| [#247](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/247) | Unspecified padding-oracle scanner warning against an external Epson class; no advisory, exploit, method, or comments; unverified on 4.5.0. | **Defer pending scanner evidence; rescan the newer Epson SDK.** |
| [#233](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/233) | TM-T82X Android discovery; raw TCP works, Epson discovery errors; overlaps #226/#232. | **Defer: hardware/permission/filter report.** |
| [#226](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/226) | Xprinter XP-58IIL; the reporter confirms an unsupported model. | **Reject/close as unsupported hardware.** |
| [#222](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/222) | HPRT TP80K; unsupported; IP syntax works for Epson. | **Reject/close support question.** |
| [#204](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/204) | VSC TM-58V support request; no SDK-support evidence. | **Defer device support.** |
| [#193](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/193) | Offline URL image crash fixed by [`abddc8e`, 2025-06-27](https://github.com/tr3v3r/react-native-esc-pos-printer/commit/abddc8e518a7dd2a2920be8536365977b2f7a3e9), included in fork `main`. | **Reject as resolved; close the stale issue.** |
| [#191](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/191) | TM-L100 `addViewShot` timeout on RN 0.68.5; `addImage` workaround. | **Defer current-version hardware reproduction.** |
| [#184](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/184) | Old iOS image-print performance report; distinct from #243. | **Defer stale/unisolated.** |
| [#154](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/154) | One Unicode glyph, no environment; overlaps #98/#135. | **Reject under-specified support.** |
| [#136](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/136) | Windows request, partial PR #169. | **Defer roadmap feature.** |
| [#135](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/135) | Japanese/Chinese; maintainer says the hardcoded ANK problem was fixed by 4.0; device charset also matters. | **Reject stale/device-specific; reproduce first.** |
| [#105](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/105) | Requested `removalWaiting`; current Android/iOS/types expose it; overlaps #250. | **Reject implemented; close the stale issue.** |
| [#98](https://github.com/tr3v3r/react-native-esc-pos-printer/issues/98) | Arabic request; maintainer recommends view/image or caller encoding; overlaps #135/#154. | **Defer/reject encoding/device support.** |

## Recommended order

1. #224.
2. #248 + #232 callback hardening.
3. #245 + #234 compatibility work.
4. Fork PR #1 model-ordering hunks / #230.
5. #243 hardware A/B with the newer Epson SDK.
6. #131 permission API/docs.
7. #185 and #250 investigation.
8. PR #241 only if roadmap-required.
