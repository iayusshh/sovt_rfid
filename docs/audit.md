# Independent verification — 11 October 2026

Independent API tests ran against the integrated application at `http://localhost:5173`, using runtime secrets without printing or committing credentials. The test created an isolated synthetic course, student and reader. These records remain as evidence and do not represent actual college attendance.

## Observed results

The initial 30 independent HTTP assertions passed; a fresh follow-up run additionally verifies a null attendance denominator and rejects reuse of an event identifier with a different card:

- Anonymous state and CSV requests rejected; cross-origin mutation rejected.
- Faculty cannot maintain students; students cannot maintain courses. Faculty state shows assigned courses; student state shows only its profile and excludes reader events and audit records.
- Reader credentials required; invalid credentials rejected; rotation revokes the previous token; disabled readers cannot mark.
- Sessions conflict on occupied reader/course. Other faculty cannot inspect, close or export the audit session.
- Enrollment removal after opening preserves the roster. Closure marks its unscanned student absent and preserves present attendance.
- Bearer scan before opening rejected; first valid scan present; exact event replay returns original response; repeated tap preserves first mark; unknown and unenrolled cards rejected; scan after close rejected.
- Correction requires a reason and retains the reason in the audit. CSV neutralizes a formula-like student name and student exports exclude another student's records.

The primary agent stopped and started the application process. A second independent HTTP probe confirmed the closed session and audited correction survived restart (2 further assertions).

The revised SQL late predicate was tested independently in SQLite at 599999ms, 600000ms and 600001ms: present, late and late respectively. A synthetic session opening time was then set eleven minutes in the past through D1. An independent bearer scan returned `late`. Further independent API checks confirmed that a new student has a null attendance percentage, an open session does not enter the denominator, a late mark counts as attended once closed, and an unscanned student gains one denominator entry without gaining attendance. These are observed HTTP results, not physical RF reads.

## Source findings resolved before final verification

The original subtraction of Julian dates could lose precision at the exact ten-minute boundary. The implementation now compares the scan date against the opening date plus ten minutes. Research/contract documentation was aligned to the actual detailed CSV export instead of incorrectly describing aggregate status-count exports.

Source inspection confirms salted PBKDF2 password derivation, server-side role checks, hashed login and reader tokens, SameSite/HttpOnly cookies, request-origin validation, parameterized SQL, atomic roster/attendance operations, unique open-session constraints and reader/event idempotency constraints. Those observations complement the executable checks; they do not prove arbitrary production security or physical RF operation.

## Reproduction

Run `tests/independent-audit.mjs` with `AUDIT_URL` and `DEMO_PASSWORD` in the environment, against isolated synthetic data only. Set `AUDIT_PROBE_FILE` to an untracked temporary path. Restart the persistent server, then rerun with `AUDIT_MODE=verify-persistence` and the same probe path. Credentials must remain in untracked runtime files.

## Remaining acceptance boundaries

Hosted deployment and rendered browser checks are owned by the primary agent and must be recorded separately. Real PN532 card reads, college-ID compatibility, actual board wiring and visible physical success/failure indicators were unavailable to this audit agent; they remain physical acceptance gates. UID-based identification is suitable for this assignment demonstration, not cryptographic proof of student identity.

## Primary integration and deployment evidence

The integrated application passed TypeScript and its production build. Browser verification observed admin sign-in, class opening with ten roster rows, simulated present attendance, in-app class closure changing pending rows to absent, student-only navigation/records, and assigned faculty course visibility. The 390×844 mobile viewport had a 390px page width; wide tables scrolled inside their own panels. Native browser confirmations were replaced with accessible in-app dialogs and the closure was reverified. Logout/session expiry clears account state and one-time reader credentials.

The ESP32 firmware compiled with PlatformIO, official Adafruit PN532 1.3.4 and ESP32 Arduino 2.0.17: RAM 39,672 bytes (12.1%) and flash 685,497 bytes (52.3%). This is build evidence, not hardware operation.

Sites deployment `appgdep_6acba5f943d0819193519c1b0d08a007` succeeded for source `59bc55205bfeb1cd984797d64285ac3bbb7b0d81`, with runtime secret revision 1 at https://sovt-attendance.iayusshh.chatgpt.site. A fresh hosted acceptance run passed 16 assertions: private access boundary, migration/bootstrap, no account privilege from service access, three role logins, exact 10-student/2-faculty seed, own-student scope, faculty restriction, reader heartbeat through both credential layers, session opening, first HTTP card present, duplicate preservation, closure, nine absent roster members, and student percentage. The hosted test session is explicitly named “HTTP acceptance check · synthetic cards”. These are online HTTP checks; the reader was not physically connected.

The hosted browser reached the private Sites sign-in page. The OpenAI account-selection page returned an external `400 Invalid content type: text/html; charset=UTF-8` error on the owner sign-in attempt. Therefore hosted browser access beyond that platform boundary remains unverified despite successful authenticated service-path API checks. The local rendered application and roles were observed. No audience/security change was used to bypass the sign-in failure.
