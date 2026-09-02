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
  MessageSquare,
  MonitorUp,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CallChat } from "@/components/call/call-chat";
import { CallTabs } from "@/components/call/call-tabs";
import {
  CallShell,
  ControlButton,
  DeviceSelect,
} from "@/components/call/call-chrome";
import type {
  RealtimeKitClientStatic,
  RealtimeKitMeeting,
} from "@/components/call/realtimekit-client";
import { useCallChat } from "@/components/call/use-call-chat";
import {
  consentToRecording,
  endLessonCall,
  joinLessonCall,
  startLessonRecording,
  stopLessonRecording,
} from "@/lib/actions/calls";
import {
  buildCallTabs,
  resolveActiveTab,
  shouldFollowShare,
  type CallTabKind,
} from "@/lib/call-tabs";

/**
 * A ONE-TO-ONE LESSON ROOM — not a meeting app.
 *
 * There are two people, always. So there is no participant list, no grid
 * layout and no stage management: the other person takes the screen and
 * you sit in the corner, which is the arrangement every video call
 * between two people converges on anyway.
 *
 * There IS a chat pane, and it is deliberately not a meeting-app chat —
 * it is a window onto the same `/messages` thread these two already
 * have, so a spelling written down mid-lesson is still there on
 * Thursday. See `call-chat.tsx`.
 *
 * "Takes the screen", not "fills" it — their frame is shown WHOLE and
 * letterboxed. A webcam sends 4:3 or 16:9 into a window wider than
 * either, so filling it means cropping the top of someone's head off.
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
  const [sharing, setSharing] = useState(false);
  const [peerSharing, setPeerSharing] = useState(false);
  const [requestedTab, setRequestedTab] = useState<CallTabKind>("lesson");
  // Whether the preset lets THIS person share. A button the provider
  // will refuse is worse than no button; hidden the moment the room says no.
  const [canShare, setCanShare] = useState(true);
  const chat = useCallChat({ lessonId, role, otherName });
  const { attach: chatAttach } = chat;

  const selfVideo = useRef<HTMLVideoElement>(null);
  const peerVideo = useRef<HTMLVideoElement>(null);
  const peerAudio = useRef<HTMLAudioElement>(null);
  const peerScreen = useRef<HTMLVideoElement>(null);
  // A shared tab's SOUND. A tutor sharing a listening clip is a core move
  // in a language lesson, and a share that arrives silent is the wrong
  // half of it.
  const peerScreenAudio = useRef<HTMLAudioElement>(null);
  const previewStream = useRef<MediaStream | null>(null);
  // The SDK's shape is broad and event-driven; `unknown` here would mean
  // casting at every call site instead of once.
  const meeting = useRef<RealtimeKitMeeting | null>(null);

  // --- What is open in the room ----------------------------------------
  const tabs = buildCallTabs({ peerSharing, selfSharing: sharing, otherName });
  // Never trusted directly: a share ending takes its tab with it, and
  // whoever was looking at it lands back on the lesson rather than on a
  // frame with nothing in it.
  const activeTab = resolveActiveTab(requestedTab, tabs);

  const peerWasSharing = useRef(false);
  useEffect(() => {
    if (shouldFollowShare(peerWasSharing.current, peerSharing)) {
      setRequestedTab("peer-screen");
    }
    peerWasSharing.current = peerSharing;
  }, [peerSharing]);

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
        // Read, never assumed: the student preset may say NOT_ALLOWED or
        // CAN_REQUEST, and there is no request flow to offer. Unknown is
        // treated as allowed so an SDK that stops reporting it does not
        // silently remove the button for everyone.
        const permission = m.self.permissions?.canProduceScreenshare;
        setCanShare(permission === undefined || permission === "ALLOWED");
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
        const shared = other.screenShareTracks?.video;
        const sharedAudio = other.screenShareTracks?.audio;
        setPeerSharing(Boolean(other.screenShareEnabled && shared));
        if (peerScreen.current && shared) {
          peerScreen.current.srcObject = new MediaStream([shared]);
        }
        if (peerScreenAudio.current) {
          peerScreenAudio.current.srcObject = sharedAudio
            ? new MediaStream([sharedAudio])
            : null;
        }
      };
      m.participants.joined.on("participantJoined", attachPeer);
      m.participants.joined.on("videoUpdate", attachPeer);
      m.participants.joined.on("audioUpdate", attachPeer);
      m.participants.joined.on("screenShareUpdate", attachPeer);
      m.participants.joined.on("participantLeft", () => {
        setPeerHere(false);
        setPeerSharing(false);
      });

      // The browser's own "Stop sharing" bar ends the track without
      // telling this component, so what the button says comes from the
      // meeting rather than from what we last asked for.
      m.self.on("screenShareUpdate", (payload: { screenShareEnabled?: boolean }) => {
        setSharing(Boolean(payload?.screenShareEnabled));
      });

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

      chatAttach(m);

      await m.join();
    } catch (e) {
      console.error("lesson call: join failed", e);
      setError(e instanceof Error ? e.message : "Could not join the lesson.");
      setStage("preflight");
    } finally {
      setBusy(false);
    }
  }, [lessonId, camOn, micOn, releasePreview, chatAttach]);

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

  const toggleShare = useCallback(async () => {
    const m = meeting.current;
    if (!m) return;
    try {
      if (sharing) {
        await m.self.disableScreenShare();
        setSharing(false);
      } else {
        await m.self.enableScreenShare();
        setSharing(true);
      }
    } catch (e) {
      // Cancelling the browser's own picker lands here, which is not an
      // error worth shouting about; anything else is.
      console.error("lesson call: screen share toggle failed", e);
      if (!sharing) toast.error("Could not share your screen.");
    }
  }, [sharing]);

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
              className="aspect-video w-full object-contain"
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
      <CallTabs tabs={tabs} active={activeTab} onSelect={setRequestedTab} />

      {/* Every frame stays MOUNTED whatever tab is showing. The streams
          are attached imperatively as the SDK hands them over, so
          unmounting one would drop a track that nothing re-delivers —
          the tab would come back black until the next renegotiation. */}

      {/* CONTAIN, never cover.
          A webcam sends 4:3 or 16:9; a desktop window is wider than
          either. `object-cover` fills that width and pays for it by
          cropping the top and bottom off — which on a 2560px monitor
          means a face scaled past life size with the top of the head
          gone. Letterboxing is what every video app does here, and the
          black it reveals is the same black the page already is, so it
          reads as framing rather than as a gap. */}
      <video
        ref={peerVideo}
        autoPlay
        playsInline
        className={cn(
          "object-contain",
          activeTab === "lesson"
            ? "h-full w-full"
            : // Their face does not leave when their screen is up:
              // reading someone's reaction to what they are showing you
              // is most of why this is a video call rather than a
              // screen share.
              "absolute right-4 top-4 aspect-video w-32 rounded-xl bg-black shadow-card sm:w-44 lg:w-56",
        )}
      />
      <video
        ref={peerScreen}
        autoPlay
        playsInline
        className={cn(
          "h-full w-full object-contain",
          activeTab === "peer-screen" ? "" : "hidden",
        )}
      />

      {/* Your own share is a PANEL, not a mirror. Rendering the screen
          you are looking at, inside the window that is on it, is the
          infinite-corridor effect every meeting app avoids — and what
          the tab is actually for is answering "can they see this?". */}
      {activeTab === "self-screen" ? (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div>
            <MonitorUp size={28} className="mx-auto text-white/70" />
            <p className="mt-3 text-sm font-medium text-white">
              You are sharing your screen
            </p>
            <p className="mt-1 text-sm text-white/60">
              {otherName} can see it. Nothing shared is recorded — only the
              two voices are.
            </p>
            <button
              type="button"
              onClick={() => void toggleShare()}
              className="mt-4 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-white backdrop-blur hover:bg-white/20"
            >
              Stop sharing
            </button>
          </div>
        </div>
      ) : null}

      <audio ref={peerAudio} autoPlay />
      <audio ref={peerScreenAudio} autoPlay />

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

      {/* Self, small, in the corner — one row down when their face has
          been moved up there by whatever is on the main frame. */}
      <video
        ref={selfVideo}
        autoPlay
        playsInline
        muted
        className={cn(
          "absolute right-4 aspect-video w-32 rounded-xl bg-black object-cover shadow-card sm:w-44 lg:w-56",
          // 1rem inset + their tile's own height (16:9 of w-32/44/56) +
          // a gap. Measured rather than eyeballed: a value that is close
          // makes the two tiles overlap by a few pixels, which reads as a
          // rendering bug rather than as a layout choice.
          activeTab === "lesson"
            ? "top-4"
            : "top-[6.25rem] sm:top-[8rem] lg:top-[9.75rem]",
        )}
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

        {/* `on` means SHARING here, so the button is filled while it is —
            the same reading as the mic being on, not the inverse the
            muted controls use. */}
        {canShare ? (
          // Not a ControlButton: that component's "<label> on/off" wording
          // is for things that are on by default, and a share is off by
          // default — borrowing it announced "Screen share on" while off.
          <button
            type="button"
            onClick={() => void toggleShare()}
            aria-label={sharing ? "Stop sharing your screen" : "Share your screen"}
            aria-pressed={sharing}
            className={cn(
              "grid h-12 w-12 place-items-center rounded-full backdrop-blur",
              sharing
                ? "bg-white text-black"
                : "bg-white/10 text-white hover:bg-white/20",
            )}
          >
            <MonitorUp size={20} />
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => (chat.open ? chat.closePane() : void chat.openPane())}
          aria-label={chat.unread > 0 ? `Messages, ${chat.unread} unread` : "Messages"}
          aria-pressed={chat.open}
          className="relative grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
        >
          <MessageSquare size={20} />
          {chat.unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.65rem] font-semibold text-white">
              {chat.unread > 9 ? "9+" : chat.unread}
            </span>
          ) : null}
        </button>

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

      <CallChat
        open={chat.open}
        onClose={chat.closePane}
        messages={chat.messages}
        selfRole={role}
        otherName={otherName}
        onSend={(body) => void chat.send(body)}
        sending={chat.sending}
        error={chat.error}
      />

      <span className="sr-only">
        In a lesson with {otherName}. You are {selfName}.
      </span>
    </div>
  );
}
