# Shared RFID attendance implementation context

Read docs/research-attendance.md before work. User authorized separate agents on git branches, full application + hosted synthetic demo + ESP32/PN532. Repo starts from Sites Vinext starter. Primary owns db/schema.ts, app/api/**, lib/**, hosting, integration tests, README/CLAUDE. Frontend agent owns app/page.tsx, app/globals.css, app/layout.tsx and its UI components. Hardware agent owns firmware/** and docs/hardware.md. Audit agent owns docs/audit.md and independent test files only. Do not revert other agents. Each agent works in its own git worktree branch then commits for primary to cherry-pick. Append only your findings here using shared main path /Users/iayusshh/Projects/sovt_rfid/.claude/context/rfid-attendance.md, not your branch copy, to avoid context merge conflicts.

## API contract (JSON unless CSV)
All endpoints under /api. Successful responses direct JSON; failures {error:string}. Session cookie is HttpOnly. Mutations browser same-origin checked. Reader uses Authorization: Bearer <reader token>; on private Sites also OAI-Sites-Authorization: Bearer <Sites service token>.
- POST /login {email,password} -> {user:{id,name,email,role,studentId?}}. POST /logout. GET /me -> {user} or 401.
- GET /state -> {user,students,faculty,courses,enrollments,sessions,attendance,readers,events,audits,stats}. Lists already scoped by role (student only self; faculty only assigned courses and enrolled students).
- Student {id,name,roll,email,cardUid,active}; faculty {id,name,email,role:'faculty'}.
- Course {id,code,name,facultyId,room}; enrollment {courseId,studentId}.
- Session {id,courseId,readerId,title,openedAt,closedAt,status:'open'|'closed'}; attendance {sessionId,studentId,status:'present'|'late'|'absent',markedAt,source:'rfid'|'manual'|'closure'}.
- Reader {id,name,lastSeen,active,sessionId?}; events {id,readerId,uid,outcome,message,createdAt}; audits {id,actor,action,detail,createdAt}.
- stats {closedSessions,attendanceRate:null|number,atRisk:number,openSessions:number}. Each student row additionally {attended,total,percentage:null|number}. Course rows additionally {enrolled:number}.
- POST /students {name,roll,email,cardUid,password}; PATCH /students/:id {name?,roll?,email?,cardUid?,active?}. Admin only.
- POST /faculty {name,email,password}. Admin only.
- POST /courses {code,name,facultyId,room}; PATCH /courses/:id {name?,room?,facultyId?}. Admin only.
- POST /enrollments {courseId,studentId}; DELETE /enrollments {courseId,studentId}. Admin only; roster snapshot unaffected.
- POST /readers {name} -> {reader,token} token shown once; POST /readers/:id/rotate -> {token}. PATCH /readers/:id {active,name}. Admin only.
- POST /sessions {courseId,readerId,title} -> {session}; POST /sessions/:id/close. Admin or assigned faculty; one active session per reader AND course.
- GET /sessions/:id/roster -> {rows:[{studentId,name,roll,status:'pending'|'present'|'late'|'absent',markedAt}],session}.
- PATCH /attendance {sessionId,studentId,status,reason} -> {ok:true}. Admin or assigned faculty.
- POST /simulate {readerId,uid} -> scan response. Admin/assigned faculty; clearly synthetic demo only. Same scan processor, source='simulated' (attendance source may also be 'simulated').
- GET /reports.csv?courseId=<optional> -> protected CSV per-student closed-session aggregate with status counts. Optional sessionId can export a session roster.
- POST /device/heartbeat {} bearer reader credential -> {readerId,sessionId:null|string,serverTime}; POST /device/scan {uid,eventId} bearer -> {outcome:'present'|'late'|'duplicate'|'unknown_card'|'not_enrolled'|'no_session'|'disabled',message,studentName?,sessionId?,serverTime}. eventId unique UUID-like <=100 chars; identical replay returns original result. Input UID normalized uppercase hex, no separators, 8/14/20 hex chars. Device heartbeat every 20 sec; online indicator within 60 sec. Network failure means retry online, no fake success.

## Demonstration
Bootstrap via POST /setup with x-setup-token runtime secret; seeded admin@demo.sovt.test, faculty1@demo.sovt.test, faculty2@demo.sovt.test, student01@demo.sovt.test ... student10. All demo accounts use DEMO_PASSWORD runtime secret; no credentials in tracked source. Setup idempotent atomic inserts; no public setup token in browser. Cards 04AABB00000001 ... 04AABB0000000A. Two courses CS301 Database Systems (faculty1), CS302 Computer Networks (faculty2); ten students enrolled in both. No forged historical attendance; empty until session flow run. Demo reader id reader-demo, token set via DEMO_READER_TOKEN. Show synthetic data banner.

## Progress
- Primary: research and contract captured; site registered private; dependencies installing.
