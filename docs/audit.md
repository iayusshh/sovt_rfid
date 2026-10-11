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
