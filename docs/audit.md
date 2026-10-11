# Independent verification

This report is pending execution against the integrated application. The independent test uses runtime credentials, creates an isolated synthetic course, student and reader, and leaves its records as audit evidence. Do not run it against actual college records.

Run with `AUDIT_URL` and `DEMO_PASSWORD` in the environment. Set `AUDIT_PROBE_FILE` to an untracked temporary file. After restarting the persistent server, run the same script with `AUDIT_MODE=verify-persistence` and that probe path.

## Required gates

- Anonymous API and CSV access denied; cross-origin mutations denied.
- Admin maintenance restricted; faculty restricted to assigned courses; student profile, activity and CSV restricted to self.
- Reader bearer credential required; rotation revokes old credentials; disabled readers cannot mark.
- One open session per course/reader; enrollment changes preserve the session roster; session closure marks missing roster students absent.
- First tap marks attendance; replayed event returns exact response; repeated tap does not alter first mark; unknown and unenrolled cards rejected.
- Present before ten minutes; late at and after ten minutes based on server time.
- Manual correction requires a reason and retains audit evidence.
- CSV cells neutralize formulas and preserve role scope.
- Records survive process restart.
- Hosted demonstration and real physical ESP32/PN532 scan remain separate acceptance gates.

## Current evidence

No executed API results yet. Physical hardware is unavailable to this audit agent. No release-readiness assertion is made from the presence of test code.
