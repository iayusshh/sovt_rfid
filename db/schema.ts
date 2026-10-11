import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  studentId: text("student_id"),
  active: integer("active").notNull().default(1),
});
export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  roll: text("roll").notNull().unique(),
  email: text("email").notNull().unique(),
  cardUid: text("card_uid").notNull().unique(),
  active: integer("active").notNull().default(1),
});
export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  facultyId: text("faculty_id")
    .notNull()
    .references(() => users.id),
  room: text("room").notNull(),
});
export const enrollments = sqliteTable(
  "enrollments",
  {
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
  },
  (t) => [primaryKey({ columns: [t.courseId, t.studentId] })],
);
export const readers = sqliteTable("readers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  active: integer("active").notNull().default(1),
  lastSeen: text("last_seen"),
});
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    readerId: text("reader_id")
      .notNull()
      .references(() => readers.id),
    title: text("title").notNull(),
    openedAt: text("opened_at").notNull(),
    closedAt: text("closed_at"),
    status: text("status").notNull(),
  },
  (t) => [
    uniqueIndex("one_open_reader")
      .on(t.readerId)
      .where(sql`status = 'open'`),
    uniqueIndex("one_open_course")
      .on(t.courseId)
      .where(sql`status = 'open'`),
  ],
);
export const roster = sqliteTable(
  "roster",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.studentId] })],
);
export const attendance = sqliteTable(
  "attendance",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    status: text("status").notNull(),
    markedAt: text("marked_at").notNull(),
    source: text("source").notNull(),
    eventId: text("event_id"),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.studentId] })],
);
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    readerId: text("reader_id")
      .notNull()
      .references(() => readers.id),
    eventId: text("event_id").notNull(),
    uid: text("uid").notNull(),
    outcome: text("outcome").notNull(),
    message: text("message").notNull(),
    studentName: text("student_name"),
    sessionId: text("session_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("reader_event_unique").on(t.readerId, t.eventId),
    index("event_time").on(t.createdAt),
  ],
);
export const audits = sqliteTable("audits", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(),
});
export const logins = sqliteTable("logins", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: text("expires_at").notNull(),
});
export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  startedAt: text("started_at").notNull(),
});
