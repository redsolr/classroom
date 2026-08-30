"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Circle,
  Loader2,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  CallShell,
  ControlButton,
  DeviceSelect,
} from "@/components/call/call-chrome";
import type {
  RealtimeKitClientStatic,
  RealtimeKitMeeting,
} from "@/components/call/realtimekit-client";
import {
  consentToRecording,
  endLessonCall,
  joinLessonCall,
  startLessonRecording,
  stopLessonRecording,
} from "@/lib/actions/calls";

/**
 * A ONE-TO-ONE LESSON ROOM — not a meeting app.
 *
 * There are two people, always. So there is no participant list, no grid
 * layout, no stage management, no chat panel: the other person fills the
 * screen and you sit in the corner, which is the arrangement every video
 * call between two people converges on anyway.
 *
 * The order of the screens is the product's ethics made concrete:
 * device check → consent → call. You see yourself, you are told in plain
 * words that the lesson will be transcribed and what for, and only then
 * is there a button that joins. Nothing records before both people have
 * agreed, and the indicator that says so never leaves the screen while it
 * does.
 */

type Stage = "preflight" | "connecting" | "live" | "ended";
type Quality = "good" | "poor" | "lost";

export function LessonCallRoom({
  lessonId,
  role,
  selfName,
  otherName,
  startsAt,
  configured,
  initialSelfConsented,
  initialBothConsented,
}: {
  lessonId: string;
  role: "teacher" | "student";
  selfName: string;
  otherName: string;
  startsAt: string;
  configured: boolean;
  initialSelfConsented: boolean;
  initialBothConsented: boolean;
}) {
  const [stage, setStage] = useState<Stage>("preflight");
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [consented, setConsented] = useState(initialSelfConsented);
  const [bothConsented, setBothConsented] = useState(initialBothConsented);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [peerHere, setPeerHere] = useState(false);
  const [quality, setQuality] = useState<Quality>("good");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioIn, setAudioIn] = useState<string>("");
  const [videoIn, setVideoIn] = useState<string>("");

  const selfVideo = useRef<HTMLVideoElement>(null);
  const peerVideo = useRef<HTMLVideoElement>(null);
  const peerAudio = useRef<HTMLAudioElement>(null);
  const previewStream = useRef<MediaStream | null>(null);
  // The SDK's shape is broad and event-driven; `unknown` here would mean
  // casting at every call site instead of once.
  const meeting = useRef<RealtimeKitMeeting | null>(null);

  // --- Pre-call preview -----------------------------------------------
  // A call you join without seeing yourself is a call that starts with
  // "can you hear me?", every time.
  useEffect(() => {
    if (stage !== "preflight") return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioIn ? { deviceId: { exact: audioIn } } : true,
          video: videoIn ? { deviceId: { exact: videoIn } } : true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        previewStream.current?.getTracks().forEach((t) => t.stop());
        previewStream.current = stream;
        if (selfVideo.current) selfVideo.current.srcObject = stream;
        // Labels are empty until permission is granted, so enumerate after.
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(all.filter((d) => d.kind !== "audiooutput"));
      } catch (e) {
        console.error("lesson call: device preview failed", e);
        if (!cancelled) {
          setError(
            "We could not reach your camera or microphone. Check the browser's permission prompt, then reload.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stage, audioIn, videoIn]);

  useEffect(() => {
    return () => {
      previewStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const releasePreview = useCallback(() => {
    previewStream.current?.getTracks().forEach((t) => t.stop());
    previewStream.current = null;
  }, []);

  // --- Joining ---------------------------------------------------------
  const join = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await joinLessonCall(lessonId);
      setBothConsented(session.bothConsented);
      setRecording(session.recording);
      setStage("connecting");

      // Loaded here, not at module scope: it is a large bundle and nobody
      // browsing the app should pay for it until they open a lesson.
      const mod = await import("@cloudflare/realtimekit");
      const RealtimeKitClient = (mod.default ?? mod) as RealtimeKitClientStatic;

      releasePreview();
      const m = await RealtimeKitClient.init({
        authToken: session.authToken,
        defaults: { audio: micOn, video: camOn },
      });
      meeting.current = m;

      m.self.on("roomJoined", () => {
        setStage("live");
        if (selfVideo.current && m.self.videoTrack) {
          selfVideo.current.srcObject = new MediaStream([m.self.videoTrack]);
        }
      });
      m.self.on("roomLeft", () => setStage("ended"));

      const attachPeer = () => {
        const other = m.participants.joined.toArray()[0];
        setPeerHere(Boolean(other));
        if (!other) return;
        if (peerVideo.current && other.videoTrack) {
          peerVideo.current.srcObject = new MediaStream([other.videoTrack]);
        }
        if (peerAudio.current && other.audioTrack) {
          peerAudio.current.srcObject = new MediaStream([other.audioTrack]);
        }
      };
      m.participants.joined.on("participantJoined", attachPeer);
      m.participants.joined.on("videoUpdate", attachPeer);
      m.participants.joined.on("audioUpdate", attachPeer);
      m.participants.joined.on("participantLeft", () => setPeerHere(false));

      // Connection quality — shown because a lesson degrading is
      // something both people need to be able to name, rather than
      // silently blame on each other.
      m.self.on("mediaScoreUpdate", (payload: { score?: number }) => {
        const score = payload?.score ?? 10;
        setQuality(score >= 7 ? "good" : "poor");
      });
      m.self.on("disconnected", () => setQuality("lost"));
      m.self.on("reconnected", () => {
        setQuality("good");
        toast.success("Reconnected");
      });

      await m.join();
    } catch (e) {
      console.error("lesson call: join failed", e);
      setError(e instanceof Error ? e.message : "Could not join the lesson.");
      setStage("preflight");
    } finally {
      setBusy(false);
    }
  }, [lessonId, camOn, micOn, releasePreview]);

  // --- Controls --------------------------------------------------------
  const toggleMic = useCallback(async () => {
    const m = meeting.current;
    if (!m) {
      setMicOn((v) => !v);
      return;
    }
    if (micOn) await m.self.disableAudio();
    else await m.self.enableAudio();
    setMicOn((v) => !v);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const m = meeting.current;
    if (!m) {
      setCamOn((v) => !v);
      return;
    }
    if (camOn) await m.self.disableVideo();
    else await m.self.enableVideo();
    setCamOn((v) => !v);
  }, [camOn]);

  const giveConsent = useCallback(async () => {
    setBusy(true);
    try {
      const res = await consentToRecording(lessonId);
      setConsented(true);
      setBothConsented(res.bothConsented);
    } catch (e) {
      console.error("lesson call: consent failed", e);
      toast.error("Could not record your consent. Try again.");
    } finally {
      setBusy(false);
    }
  }, [lessonId]);

  const toggleRecording = useCallback(async () => {
    setBusy(true);
    try {
      if (recording) {
        await stopLessonRecording(lessonId);
        setRecording(false);
        toast.success("Recording stopped");
      } else {
        await startLessonRecording(lessonId);
        setRecording(true);
        toast.success("Recording — this lesson will become study material");
      }
    } catch (e) {
      console.error("lesson call: recording toggle failed", e);
      // The server's refusals are written to be read by a person.
      toast.error(e instanceof Error ? e.message : "Could not change recording.");
    } finally {
      setBusy(false);
    }
  }, [lessonId, recording]);

  const leave = useCallback(async () => {
    try {
      await meeting.current?.leave();
    } catch (e) {
      console.error("lesson call: leave failed", e);
    }
    try {
      await endLessonCall(lessonId);
    } catch (e) {
      console.error("lesson call: ending the room failed", e);
    }
    setStage("ended");
  }, [lessonId]);

  // --- Screens ---------------------------------------------------------
  if (!configured) {
    return (
      <CallShell>
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-xl font-semibold">Live lessons are not set up</h1>
          <p className="mt-2 text-sm text-fg-secondary">
            This environment has no RealtimeKit credentials, so the room
            cannot open. Nothing is wrong with your booking.
          </p>
        </div>
      </CallShell>
    );
  }

  if (stage === "ended") {
    return (
      <CallShell>
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-xl font-semibold">Lesson ended</h1>
          <p className="mt-2 text-sm text-fg-secondary">
            {recording
              ? "The recording is being processed. It will appear on the lesson once it is ready."
              : "Nothing was recorded."}
          </p>
          <Link
            href="/tutors/bookings"
            className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Back to your lessons
          </Link>
        </div>
      </CallShell>
    );
  }

  if (stage === "preflight") {
    return (
      <CallShell>
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-xl font-semibold">Lesson with {otherName}</h1>
          <p className="mt-1 text-sm text-fg-secondary">
            {new Intl.DateTimeFormat(undefined, {
              weekday: "long",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(startsAt))}
          </p>

          <div className="mt-5 overflow-hidden rounded-2xl bg-black shadow-card">
            <video
              ref={selfVideo}
              autoPlay
              playsInline
              muted
              className="aspect-video w-full object-cover"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <DeviceSelect
              label="Microphone"
              kind="audioinput"
              devices={devices}
              value={audioIn}
              onChange={setAudioIn}
            />
            <DeviceSelect
              label="Camera"
              kind="videoinput"
              devices={devices}
              value={videoIn}
              onChange={setVideoIn}
            />
          </div>

          <div className="mt-3 flex gap-2">
            <ControlButton on={micOn} onClick={toggleMic} label="Microphone">
              {micOn ? <Mic size={18} /> : <MicOff size={18} />}
            </ControlButton>
            <ControlButton on={camOn} onClick={toggleCam} label="Camera">
              {camOn ? <Video size={18} /> : <VideoOff size={18} />}
            </ControlButton>
          </div>

          {/* Consent, before the join button — never after, and never
              buried. A person has to be able to decline and still be in
              the lesson. */}
          <div className="mt-5 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <p className="text-sm font-medium">
                  This lesson will be transcribed
                </p>
                <p className="mt-1 text-sm text-fg-secondary">
                  We record each voice separately to turn the lesson into
                  notes, learning evidence and study material. Both of you
                  have to agree before anything is recorded, and you will see
                  an indicator the whole time it is.
                </p>
                {consented ? (
                  <p className="mt-3 text-sm font-medium text-success">
                    You agreed
                    {bothConsented
                      ? " — and so did they."
                      : `. Waiting for ${otherName}.`}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={giveConsent}
                    disabled={busy}
                    className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
                  >
                    I agree to be recorded
                  </button>
                )}
              </div>
            </div>
          </div>

          {error ? (
            <p className="mt-4 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={join}
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            Join lesson
          </button>
          <p className="mt-2 text-center text-xs text-fg-secondary">
            You can join without agreeing — the lesson simply will not be
            recorded.
          </p>
        </div>
      </CallShell>
    );
  }

  // --- Live ------------------------------------------------------------
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      <video
        ref={peerVideo}
        autoPlay
        playsInline
        className="h-full w-full object-cover"
      />
      <audio ref={peerAudio} autoPlay />

      {!peerHere ? (
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <Loader2 size={22} className="mx-auto animate-spin text-white/70" />
            <p className="mt-3 text-sm text-white/70">
              {stage === "connecting"
                ? "Connecting…"
                : `Waiting for ${otherName} to join`}
            </p>
          </div>
        </div>
      ) : null}

      {/* Self, small, in the corner. */}
      <video
        ref={selfVideo}
        autoPlay
        playsInline
        muted
        className="absolute right-4 top-4 aspect-video w-32 rounded-xl object-cover shadow-card sm:w-44"
      />

      {/* The indicator that must never be absent while recording. */}
      <div className="absolute left-4 top-4 flex items-center gap-2">
        {recording ? (
          <span className="flex items-center gap-1.5 rounded-full bg-danger/90 px-3 py-1 text-xs font-medium text-white">
            <Circle size={8} className="animate-pulse fill-current" />
            Recording &amp; transcribing
          </span>
        ) : null}
        {quality !== "good" ? (
          <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs text-white/90">
            {quality === "lost" ? <WifiOff size={12} /> : <Wifi size={12} />}
            {quality === "lost" ? "Reconnecting…" : "Weak connection"}
          </span>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-10">
        <ControlButton on={micOn} onClick={toggleMic} label="Microphone" dark>
          {micOn ? <Mic size={20} /> : <MicOff size={20} />}
        </ControlButton>
        <ControlButton on={camOn} onClick={toggleCam} label="Camera" dark>
          {camOn ? <Video size={20} /> : <VideoOff size={20} />}
        </ControlButton>

        {role === "teacher" ? (
          <button
            type="button"
            onClick={toggleRecording}
            disabled={busy || (!recording && !bothConsented)}
            title={
              !bothConsented && !recording
                ? "Both of you must agree before recording can start"
                : undefined
            }
            className="flex h-12 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium text-white backdrop-blur hover:bg-white/20 disabled:opacity-40"
          >
            <Circle
              size={10}
              className={recording ? "fill-current text-danger" : "text-white"}
            />
            {recording ? "Stop" : "Record"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={leave}
          aria-label="Leave lesson"
          className="grid h-12 w-12 place-items-center rounded-full bg-danger text-white hover:opacity-90"
        >
          <PhoneOff size={20} />
        </button>
      </div>

      <span className="sr-only">
        In a lesson with {otherName}. You are {selfName}.
      </span>
    </div>
  );
}
