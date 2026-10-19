# iPhone NFC reader via Apple Shortcuts — research (19 October 2026)

## Decision
The faculty iPhone is the reader. A single Shortcut loops **Scan NFC Tag** and POSTs each tag's serial number to the existing `POST /api/device/scan`. Each faculty iPhone has its own reader credential (Admin → Readers). The ESP32 + PN532 firmware and hardware guide are removed; the server API is unchanged because a Shortcut can already send what the endpoint wants: a bearer header, a JSON body, no `Origin` header (device routes are exempt from the browser origin check), and a UID with `:`, `-`, spaces or lowercase (the server normalizes it).

No Apple Developer account is needed: Shortcuts ships the NFC action. A native app using Core NFC would need the paid program, and Safari has no Web NFC.

## What is NOT established
Whether Shortcuts hands a **college ID's** UID to later actions. Searches found only that the NFC *trigger* matches tags by hardware identifier and that MIFARE Classic reads on iOS are unreliable through app APIs; no authoritative source states what the Scan NFC Tag action returns for non-NDEF cards. Nothing here is verified on a physical iPhone or ID. The first step is therefore the probe in `docs/iphone-reader.md`. Fallback agreed with the owner: an NTAG sticker on the ID, whose UID maps to the student.

Sources: [Shortcuts NFC trigger/UID matching](https://gototags.com/articles/use-nfc-tags-with-iphone-shortcuts-app), [Apple forums: MIFARE Classic UID on iOS](https://developer.apple.com/forums/thread/717021), [Core NFC NDEF status](https://developer.apple.com/documentation/corenfc/nfcndefstatus/notsupported.md).

## Design consequences
- Enrollment: an unregistered tap is already logged with its UID. Admin → Activity shows unassigned UIDs from recent taps with an "assign to student" control (uses existing `PATCH /students/:id`).
- Event IDs: the Shortcut sends a fresh random `eventId` per tap. A transport-retry reuses it; a second physical tap gets a new one and is a duplicate.
- Start of run: the Shortcut calls `/device/heartbeat` first and stops with "No open class" when `sessionId` is null, and so the reader shows Online.
- Feedback is on-screen only (owner's choice). Network failure must never display success: the Shortcut shows the server `message`, or "Not recorded, retry" when the request fails.
- Token lives in the Shortcut. Anyone who can edit it can read the token; rotate it from the admin screen if the phone is shared.

## FAQ
**Why not per-card NFC automations?** One automation per card, run-confirmation prompts, and no student mapping on the server. The scan-loop Shortcut needs one setup.
**Can the Shortcut be committed to the repo?** Exported `.shortcut` files are signed by Apple and embed the token, so the guide gives build steps instead.
**Is a UID proof of identity?** No. It can be cloned or lent; this is assignment-level identification.
**What if the ID's UID is randomized or unreadable?** Probe shows it; use the sticker fallback.
**Offline?** Nothing is queued; the faculty retaps online. Corrections need a reason and are audited.
