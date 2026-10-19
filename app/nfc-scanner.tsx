"use client";

import { useEffect, useRef, useState } from "react";
import { Radio } from "lucide-react";

// Web NFC is only exposed by Chrome on Android, over HTTPS, from a user gesture.
type NfcReader = {
  scan(options?: { signal: AbortSignal }): Promise<void>;
  onreading: ((e: { serialNumber: string }) => void) | null;
  onreadingerror: (() => void) | null;
};
type Tap = { at: number; text: string; ok: boolean };

export function NfcScanner({
  sessionId,
  onTap,
}: {
  sessionId: string;
  onTap: () => void;
}) {
  const [state, setState] = useState<"idle" | "on" | "unsupported" | "error">(
    "idle",
  );
  const [detail, setDetail] = useState("");
  const [taps, setTaps] = useState<Tap[]>([]);
  const abort = useRef<AbortController | null>(null);
  const last = useRef({ uid: "", at: 0 });

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => abort.current?.abort(), [sessionId]);

  async function submit(uid: string) {
    let line: Tap;
    try {
      const r = await fetch(`/api/sessions/${sessionId}/tap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, eventId: crypto.randomUUID() }),
      });
      const j = await r.json();
      line = r.ok
        ? {
            at: Date.now(),
            ok: ["present", "late"].includes(j.outcome),
            text: `${j.studentName ? `${j.studentName} · ` : ""}${j.message}`,
          }
        : { at: Date.now(), ok: false, text: `Not recorded: ${j.error}` };
    } catch {
      line = {
        at: Date.now(),
        ok: false,
        text: "Not recorded: no connection. Tap again online.",
      };
    }
    setTaps((t) => [line, ...t].slice(0, 6));
    onTap();
  }

  async function start() {
    const NDEFReader = (
      window as unknown as { NDEFReader?: new () => NfcReader }
    ).NDEFReader;
    if (!NDEFReader) return setState("unsupported");
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    try {
      const reader = new NDEFReader();
      reader.onreading = (e) => {
        // The tag stays in the field for a second or more and fires repeatedly.
        const now = Date.now();
        if (e.serialNumber === last.current.uid && now - last.current.at < 4000)
          return;
        last.current = { uid: e.serialNumber, at: now };
        void submit(e.serialNumber);
      };
      reader.onreadingerror = () =>
        setTaps((t) =>
          [
            {
              at: Date.now(),
              ok: false,
              text: "Card detected but not readable. Try again or use another card.",
            },
            ...t,
          ].slice(0, 6),
        );
      await reader.scan({ signal: ctl.signal });
      setState("on");
    } catch (e) {
      setDetail(e instanceof Error ? e.message : "NFC could not start.");
      setState("error");
    }
  }

  function stop() {
    abort.current?.abort();
    setState("idle");
  }

  return (
    <div className="simulator nfc-scanner">
      <div>
        <strong>Phone NFC reader</strong>
        <p>
          {state === "unsupported"
            ? "This browser has no NFC support. Open this page in Chrome on an Android phone with NFC turned on."
            : state === "on"
              ? "Scanning. Hold each ID against the back of this phone. Keep this screen on."
              : "Use Chrome on an Android phone. Each ID tapped on the phone is submitted to this class."}
        </p>
        {state === "error" && <p role="alert">{detail}</p>}
      </div>
      <button
        className={state === "on" ? "button secondary" : "button"}
        onClick={state === "on" ? stop : start}
      >
        <Radio size={16} />{" "}
        {state === "on" ? "Stop scanning" : "Start scanning"}
      </button>
      {taps.length > 0 && (
        <ul className="nfc-taps" aria-live="polite">
          {taps.map((t) => (
            <li key={t.at} data-ok={t.ok}>
              {t.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
