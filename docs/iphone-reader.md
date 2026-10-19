# iPhone reader setup (Apple Shortcuts)

The faculty iPhone reads the ID and sends its serial number to this workspace. Needs an iPhone with NFC (XS or later), the Shortcuts app, and no Apple Developer account. Background: [research](research-iphone-shortcuts.md). **Nothing in this guide has been verified on a physical iPhone and ID yet** — do step 1 first.

## 1. Probe: can the iPhone read your ID?

New shortcut with two actions: **Scan NFC Tag**, then **Show Result** with the tag's **Serial Number** as input. Run it and hold the top edge of the iPhone against the ID (remove thick cases/wallet).

| What you see | Meaning |
|---|---|
| Hex serial such as `04:AA:BB:CC:DD:EE:FF` or `1A2B3C4D`, same on repeated taps | Works. Use the ID directly. |
| Serial changes every tap | Randomized UID. Cannot identify the student; use a sticker. |
| "No tag found", error, or an empty value | Card not readable by Shortcuts. Stick an NTAG213/215 sticker on the ID (not on a metal surface) and probe that. |

Serials must be 4, 7 or 10 bytes (8, 14 or 20 hex characters); the server rejects anything else.

## 2. Create the reader credential (admin)

Admin → Readers → add a reader named for the phone, e.g. "Prof. Rao iPhone". Copy the token shown once. Rotating it immediately revokes the old one.

## 3. Build the attendance shortcut

Replace `BASE` with `https://sovt-rfid.vercel.app` and `TOKEN` with the reader token.

1. **Text** `BASE` → Get Contents of URL: `BASE/api/device/heartbeat`, method POST, header `Authorization` = `Bearer TOKEN`.
2. **Get Dictionary Value** `sessionId`. **If** it has no value → **Show Alert** "No open class on this reader" → **Stop Shortcut**.
3. **Repeat** 300 times:
   1. **Scan NFC Tag**.
   2. **Text** for the event id: Current Date formatted *Custom* `yyyyMMddHHmmssSSS`, a dash, and **Random Number** 100000–999999.
   3. **Get Contents of URL** `BASE/api/device/scan`, POST, header `Authorization: Bearer TOKEN`, Request Body **JSON** with `uid` = Serial Number and `eventId` = the text above.
   4. **Get Dictionary Value** `message` and `studentName` → **Show Result**.

Add it to the Home Screen or Action Button. A failed request makes Shortcuts show an error — that tap was **not** recorded; retap online. Messages: *Attendance recorded*, *recorded as late*, *Already recorded; original mark preserved*, *Card is not registered*, *Student is not on this session roster*, *No class session is open*.

## 4. Enroll cards

Faculty needs no setup per student. Before term, tap each student's ID once on any reader; Admin → Activity → **Unassigned cards** lists the UIDs, and each can be assigned to a student. Then enroll the student in the course as usual.

## 5. Class flow

Faculty opens a session in the web app on the iPhone and picks the phone's reader, then runs the shortcut and students tap in turn. Present before 10 minutes, late after; closing the session marks the rest absent.

## Limits

UIDs can be cloned or lent. The loop Shortcut stops when the phone locks or the app is interrupted; rerun it. Back-to-back taps may need the card removed between reads.
