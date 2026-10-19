# Android reader setup

Needs an Android phone with NFC, Chrome, and the workspace's HTTPS address. Background: [research](research-android-web-nfc.md). **No run on a real phone and ID has been verified yet — do step 1.**

## 1. Check the ID reads at all
Install **NFC TagInfo by NXP** (or NFC Tools), turn NFC on, hold the back of the phone against the ID. Note the UID, repeated three times:

| What you see | Meaning |
|---|---|
| Same 4/7/10-byte UID each tap | Works; the server accepts 8, 14 or 20 hex characters. |
| UID changes every tap | Randomized; cannot identify a student. Use an NTAG sticker. |
| Not detected | Not a 13.56 MHz NFC card (e.g. 125 kHz). Use an NTAG sticker. |

## 2. Enroll cards
Open the workspace in Chrome, sign in as admin, open a class (admin may), tap each ID. Under **Activity & audit → Unassigned cards**, assign each UID to its student, then enroll the student in the course.

## 3. Take attendance
Faculty signs in with Chrome on the Android phone, opens a class session, scrolls to **Phone NFC reader** and taps **Start scanning**; Chrome asks for NFC access once. Students tap their ID on the back of the phone. The panel lists each result; a result is only green after the server confirms present or late. Keep the screen on; **Stop scanning** when done, then close the class.

## Limits
Chrome on Android only. A card held on the phone repeats; the page ignores the same card for four seconds. If a card is "detected but not readable", Chrome cannot read that card type: try the TagInfo check or a sticker.
