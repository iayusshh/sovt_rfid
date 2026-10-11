# RFID attendance research — 11 October 2026

## Confirmed scope
One college demonstration: 10 synthetic students, 2 faculty, admin/faculty/student accounts. Admin maintains students, faculty, courses and enrollment. Faculty opens a course session linked to a reader; attendance is present before 10 minutes and late at or after 10 minutes. Closing marks the session roster's missing students absent. Repeated scans do not overwrite the first mark. Faculty corrections require a reason and retain an audit trail. Closed sessions form the denominator for attendance; present and late count as attended. Below 75% triggers an in-app alert. CSV exports. No entry/exit or occupancy. No external notifications. Version 2: profile portal and parent/student email together.

## Hardware decision and boundaries
User rejected per-card iPhone automations. ESP32 + PN532 uses Wi-Fi and 13.56 MHz ISO14443 Type A UID reads; the iPhone is the mobile faculty dashboard. Existing college ID compatibility is unknown. Compatible demonstration cards are the fallback. UID identification is assignment-level identification, not cryptographic proof of identity. Physical scan acceptance needs the user's actual board/cards.

Sources: [Apple Core NFC](https://developer.apple.com/documentation/CoreNFC); [Apple Shortcut NFC triggers](https://support.apple.com/en-euro/guide/shortcuts/apde31e9638b/9.0/ios/26); [Web NFC limitations](https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API); [PN532 manufacturer](https://www.nxp.com/products/rfid-nfc/nfc-hf/nfc-readers/nfc-integrated-solution:PN5321A3HN); [ESP32 manufacturer](https://www.espressif.com/en/products/socs/esp32/datasheet); [Adafruit PN532 library](https://github.com/adafruit/Adafruit-PN532).

## Application and hosting
Vinext/React with a Cloudflare Worker API and persistent D1 database, using the installed Sites starter. Schema migrations are generated and applied before publication. Assignment role accounts use password hashing and server-side role authorization; the private hosted demonstration additionally preserves the Sites outer sign-in boundary. Reader service traffic must pass both Sites service access (OAI-Sites-Authorization header) and its own revocable reader credential. No public audience change is authorized. External faculty/student access therefore also requires Sites access grants; owner can exercise all synthetic demo logins.

## Design evaluation
Checked Refero, Recent, Mobbin, and the user's Notion reference. Refero did not expose browseable screens; Notion was inaccessible. Mobbin/Recent inform compact operational navigation, restrained typography, clear status labels, and mobile layouts. Existing React/Lucide stack is retained. Astryx considered but no extra design-system dependency is necessary over the supplied base primitives; Animate UI and React Bits effects add little to attendance operations. Lenis/scroll-world cinematic behavior is inappropriate for forms and tables. Inspira is Vue-specific. Use a deliberate ink/ivory/indigo attendance workspace with meaningful scanning feedback and reduced-motion support.

## FAQ
**Can Safari on iPhone scan arbitrary IDs?** No Web NFC support; native NFC requires compatible tags. Shortcuts needs per-tag configuration and was rejected.
**Does every tap mean present?** First valid course-session tap is present or late based on server time; duplicate taps preserve it.
**What if internet fails?** Device shows failure, does not confirm attendance, and the student retaps online. No offline queue; faculty can correct with a reason.
**What is attendance percentage?** Present plus late divided by closed sessions for which that student was on the session roster. No closed sessions means no percentage or warning.
**Can I use my college card?** Only after checking frequency/type and confirming a UID read with the hardware.
**What is verified without hardware?** API lifecycle, authorization, persistence, reader HTTP protocol, and rendered browser behavior; not RF reads, wiring or physical LED behavior.

## Verification gates
Research/contract before implementation; integration build and fresh lifecycle/security tests before independent audit; fix audit findings before publication; check deployed status and hosted request path. Physical board testing remains a clearly reported gate.
