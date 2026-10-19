# Android Web NFC reader — research (19 October 2026)

## Decision
The iPhone/Shortcuts reader was dropped: Shortcuts could not read the owner's college ID. The faculty uses an **Android phone in Chrome**: Admin or assigned faculty opens a class, then taps **Start scanning** in the class roster. Each ID tapped on the back of the phone is sent to `POST /api/sessions/:id/tap` and goes through the same scan processor as every other reader (roster snapshot, ten-minute late rule, duplicates preserve the first mark, atomic writes, event log). No app, no developer account.

`/api/sessions/:id/tap` authenticates with the normal role session cookie, so authorization is checked on the server: students and unassigned faculty get 403, closed sessions 409. The session's reader still names the class's scanner. The `/api/device/*` endpoints and reader tokens remain for any dedicated hardware but the browser reader does not use them.

## What is established and what is not
- Chrome on Android exposes Web NFC (`NDEFReader`) over HTTPS from a user gesture; the `reading` event carries `serialNumber`, and `readingerror` fires for incompatible tags. A W3C Web NFC thread reports that an unformatted or unrecognized tag gives a reading event with no records while its UID is still reported ([W3C issue thread](https://lists.w3.org/Archives/Public/public-web-nfc/2019Oct/0045.html), [Chrome docs](https://developer.chrome.com/docs/capabilities/nfc)).
- **Not verified:** how Chrome treats the owner's actual card (MIFARE Classic or DESFire). No source confirmed MIFARE Classic behaviour. Confirm with a native tag app (NFC TagInfo by NXP) first, then the Start scanning button.
- A randomized UID (some DESFire designs) cannot identify a student on any phone.

## Design consequences
- The browser debounces: a card held in the field fires `reading` repeatedly, so the same serial within four seconds is ignored client-side. Each real tap carries a fresh random `eventId`; the server prefixes it `web-`.
- Failure never reads as success: a network error shows "Not recorded", and `readingerror` shows "Card detected but not readable".
- Serial format `04:aa:bb:..` is normalized by the existing UID parser.
- Enrollment is unchanged: tap an unregistered ID, then assign it from Activity → Unassigned cards. (The tap needs an open class to reach the server from the phone.)
- Chrome only, screen on, NFC enabled; Safari and iOS have no Web NFC.

## FAQ
**Why not a native Android app?** Costs a build and install per teacher; Web NFC needs neither. Use a native app if the probe shows the ID is only readable that way.
**Can the same page be used on a laptop?** No; no NFC hardware or Web NFC support.
**Is a UID proof of identity?** No. It can be cloned or lent.
**Offline?** Nothing is queued; retap online. Corrections need a reason and are audited.
