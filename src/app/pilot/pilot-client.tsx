"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* Types mirrored from src/lib/pilot/types.ts (public shape)           */
/* ------------------------------------------------------------------ */

type Option = {
  id: string;
  label: string;
  detail: string;
  votes: number;
  visualBeat?: string;
  stageDirection?: string;
  continuity?: {
    opening: { location: string; motion: string };
    closing: { location: string; motion: string };
    transition: {
      mode: "continuous" | "match-on-action" | "time-bridge";
      description: string;
    };
  };
};
type Episode = {
  id: string;
  number: number;
  title: string;
  logline: string;
  script: string;
  videoUrl: string | null;
  posterUrl: string;
  lastFrameUrl?: string | null;
  renderStatus: "none" | "rendering" | "done" | "failed";
  options: Option[];
  winnerOptionId: string | null;
  continuityReview?: {
    status: "needed" | "analyzing" | "ready" | "failed";
    observedAt: string | null;
    confidence: number | null;
    travelPhase:
      | "departing"
      | "in-transit"
      | "arriving"
      | "stationary"
      | "unclear"
      | null;
    completedActions: string[];
    mismatches: string[];
    evidence: string[];
    error?: string | null;
  };
  createdAt: string;
};
type Character = {
  name: string;
  job: string;
  savings: number;
  energy: number;
  social: string;
  mood: string;
};
type PublicState = {
  character: Character;
  episodes: Episode[];
  currentEpisodeId: string | null;
  renderingEnabled: boolean;
  renderMode?: "consumer" | "session" | "api" | "off";
  yourVote?: string | null;
  alreadyVoted?: boolean;
};

const CATEGORIES = [
  { id: "video", label: "📺 Video", live: true },
  { id: "games", label: "🎮 Games", live: false },
  { id: "tools", label: "🛠️ Tools", live: false },
  { id: "stories", label: "📖 Stories", live: false },
] as const;

const FEATURE_IDEAS = [
  "Show Devon's bank balance on screen during episodes",
  "Prediction market: bet points on which option wins",
  "Text Devon between episodes (he might reply)",
  "Votes and episodes on X/Twitter with native polls",
];

function waitForSeek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("timed out reading rendered frames")),
      12_000,
    );
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("could not read rendered video for continuity review"));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = time;
  });
}

async function captureRenderedEndFrames(videoUrl: string): Promise<Blob[]> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("timed out loading rendered video")),
      20_000,
    );
    video.addEventListener(
      "loadedmetadata",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    video.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        reject(new Error("could not load rendered video for continuity review"));
      },
      { once: true },
    );
    video.src = videoUrl;
    video.load();
  });

  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    throw new Error("rendered video has no readable duration");
  }

  const times = [
    Math.max(0.05, video.duration - 1.5),
    Math.max(0.05, video.duration - 0.75),
    Math.max(0.05, video.duration - 0.08),
  ];
  const width = 360;
  const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
  const frames: Blob[] = [];

  try {
    for (const time of times) {
      await waitForSeek(video, Math.min(time, Math.max(0.05, video.duration - 0.02)));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("browser could not create continuity frame");
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.84),
      );
      if (!blob) throw new Error("browser could not encode continuity frame");
      frames.push(blob);
    }
  } finally {
    video.removeAttribute("src");
    video.load();
  }

  return frames;
}

function useCountdown(target: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, target - now);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export default function PilotClient() {
  const [category, setCategory] = useState<string>("video");
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yourVote, setYourVote] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [cyclePhase, setCyclePhase] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState("");
  const [customDetail, setCustomDetail] = useState("");
  const [customVisualBeat, setCustomVisualBeat] = useState("");
  const [customStageDirection, setCustomStageDirection] = useState("");
  const [resetting, setResetting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [clipEnded, setClipEnded] = useState(false);
  const [continuityPhase, setContinuityPhase] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleAbort = useRef<AbortController | null>(null);
  const reconciliationAttempts = useRef(new Set<string>());

  const applyState = useCallback((data: PublicState) => {
    setState(data);
    if (data.yourVote) setYourVote(data.yourVote);
    else if (data.alreadyVoted === false) setYourVote(null);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/pilot/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`state ${res.status}`);
      const data = (await res.json()) as PublicState;
      applyState(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
      return null;
    }
  }, [applyState]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while the latest episode is awaiting video.
  useEffect(() => {
    const current = state?.episodes[state.episodes.length - 1];
    if (!current || current.renderStatus !== "rendering") {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }
    if (pollTimer.current) return;

    const mode = state?.renderMode ?? "consumer";
    pollTimer.current = setInterval(async () => {
      // consumer + api: ask the server to check (and kick) the job
      if (mode === "api" || mode === "consumer" || mode === "session") {
        const res = await fetch("/api/pilot/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ episodeId: current.id }),
        });
        if (res.ok) {
          const data = (await res.json()) as PublicState & { renderStatus: string };
          applyState(data);
          if (data.renderStatus !== "rendering") {
            setCyclePhase(null);
          }
        } else {
          const data = await refresh();
          const ep = data?.episodes.find((e) => e.id === current.id);
          if (ep && ep.renderStatus !== "rendering") {
            setCyclePhase(null);
          }
        }
      }
    }, 5000);

    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [state, applyState, refresh]);

  const pollClose = useMemo(() => {
    const d = new Date();
    d.setHours(21, 0, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }, []);
  const countdown = useCountdown(pollClose);

  const current = state?.episodes[state.episodes.length - 1] ?? null;
  const viewing =
    (viewingId && state?.episodes.find((e) => e.id === viewingId)) || current;
  const totalVotes = current
    ? current.options.reduce((s, o) => s + o.votes, 0)
    : 0;
  const pollClosed = Boolean(current?.winnerOptionId);
  const continuityReady = current?.continuityReview?.status === "ready";

  const reconcileCurrentEpisode = useCallback(
    async (episode: Episode, force = false) => {
      if (!episode.videoUrl || episode.renderStatus !== "done") return;
      if (!force && reconciliationAttempts.current.has(episode.id)) return;
      reconciliationAttempts.current.add(episode.id);
      setContinuityPhase("Reading the actual final frames…");
      setError(null);
      try {
        const frames = await captureRenderedEndFrames(episode.videoUrl);
        setContinuityPhase("Rewriting choices from what actually happened…");
        const form = new FormData();
        form.set("episodeId", episode.id);
        if (force) form.set("force", "true");
        frames.forEach((frame, index) => {
          form.append("frames", frame, `ep-${episode.number}-end-${index + 1}.jpg`);
        });
        const res = await fetch("/api/pilot/reconcile", {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `continuity review failed (${res.status})`);
        applyState(data as PublicState);
      } catch (reason) {
        await refresh();
        setError(
          reason instanceof Error ? reason.message : "continuity review failed",
        );
      } finally {
        setContinuityPhase(null);
      }
    },
    [applyState, refresh],
  );

  useEffect(() => {
    if (!current?.videoUrl || current.renderStatus !== "done") return;
    const status = current.continuityReview?.status || "needed";
    if (status !== "needed") return;
    void reconcileCurrentEpisode(current);
  }, [
    current,
    current?.id,
    current?.videoUrl,
    current?.renderStatus,
    current?.continuityReview?.status,
    reconcileCurrentEpisode,
  ]);

  function selectEpisode(id: string) {
    setVideoReady(false);
    setVideoError(null);
    setClipEnded(false);
    setViewingId(id);
    requestAnimationFrame(() => {
      playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function markVideoReady() {
    setVideoReady(true);
    setVideoError(null);
    setClipEnded(false);
    const el = videoRef.current;
    if (!el) return;
    // Autoplay may be blocked — controls still work once ready.
    el.play().catch(() => undefined);
  }

  // When the episode/src changes, clear error state and recover from missed
  // media events (cache hits, slow first byte on large mp4s).
  useEffect(() => {
    if (!viewing?.videoUrl) {
      setVideoReady(false);
      return;
    }

    setVideoError(null);
    setClipEnded(false);
    // Keep prior ready=true only if we're not switching clips; otherwise hide
    // the spinner as soon as the element has data.
    setVideoReady(false);

    let cancelled = false;
    const check = () => {
      if (cancelled) return;
      const el = videoRef.current;
      if (!el) return;
      if (el.readyState >= 2) markVideoReady();
    };

    const t0 = window.setTimeout(check, 50);
    const t1 = window.setTimeout(check, 300);
    const t2 = window.setTimeout(check, 1000);
    // Fail open quickly — never leave the user on an infinite spinner.
    const t3 = window.setTimeout(() => {
      if (!cancelled) setVideoReady(true);
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [viewing?.id, viewing?.videoUrl]);

  function onVideoEnded() {
    setClipEnded(true);
  }

  function onVideoError() {
    setVideoReady(false);
    setVideoError("Couldn't load this clip — try another episode or refresh.");
  }

  const nextEpisode = useMemo(() => {
    if (!state || !viewing) return null;
    return state.episodes.find((e) => e.number === viewing.number + 1) ?? null;
  }, [state, viewing]);

  /** The prior night's winning vote that produced the clip you're watching. */
  const sourceChoice = useMemo(() => {
    if (!state || !viewing || viewing.number < 2) return null;
    const prior = state.episodes.find((e) => e.number === viewing.number - 1);
    if (!prior?.winnerOptionId) return null;
    return prior.options.find((o) => o.id === prior.winnerOptionId) ?? null;
  }, [state, viewing]);

  async function resetSeason() {
    if (resetting || cyclePhase) return;
    const ok = window.confirm(
      "Reset Patch Notes to Episode 1?\n\nThis wipes all episodes, votes, and character progress."
    );
    if (!ok) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `reset failed (${res.status})`);
        return;
      }
      applyState(data as PublicState);
      setYourVote(null);
      setViewingId(null);
      setCustomLabel("");
      setCustomDetail("");
      setCustomVisualBeat("");
      setCustomStageDirection("");
      setCyclePhase(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "reset failed");
    } finally {
      setResetting(false);
    }
  }

  async function vote(optionId: string) {
    if (!current || yourVote || voting || pollClosed) return;
    setVoting(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: current.id, optionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `vote failed (${res.status})`);
        return;
      }
      applyState(data as PublicState);
      setYourVote(data.yourVote ?? optionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "vote failed");
    } finally {
      setVoting(false);
    }
  }

  async function submitCustomOption() {
    const label = customLabel.trim();
    const visual = customVisualBeat.trim();
    const stage = customStageDirection.trim();
    if (!current || !label || !visual || !stage || yourVote || voting || pollClosed) return;
    setVoting(true);
    setError(null);
    try {
      const res = await fetch("/api/pilot/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId: current.id,
          customLabel: label,
          customDetail: customDetail.trim() || undefined,
          customVisualBeat: visual,
          customStageDirection: stage,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `vote failed (${res.status})`);
        return;
      }
      applyState(data as PublicState);
      setYourVote(data.yourVote ?? null);
      setCustomLabel("");
      setCustomDetail("");
      setCustomVisualBeat("");
      setCustomStageDirection("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "vote failed");
    } finally {
      setVoting(false);
    }
  }

  async function runCycle() {
    if (cyclePhase) return;
    setError(null);
    setCyclePhase("1/3 Closing poll…");
    const ac = new AbortController();
    cycleAbort.current = ac;
    const watchdog = setTimeout(() => ac.abort(), 55_000);
    try {
      // Brief tick so the user sees phase changes while Claude writes.
      setCyclePhase("2/3 Writing next beat with Claude…");
      const res = await fetch("/api/pilot/cycle", {
        method: "POST",
        signal: ac.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCyclePhase(null);
        // If we raced a completed cycle, refresh so the UI catches up.
        if (res.status === 429) {
          await refresh();
        }
        setError(data.error || `cycle failed (${res.status})`);
        return;
      }
      applyState(data as PublicState);
      setYourVote(null);
      setViewingId(null);
      const mode = data.cycle?.renderMode ?? data.renderMode ?? "consumer";
      if (data.cycle?.recovered) {
        setCyclePhase(null);
        // Soft sync after a double-click / in-flight cycle — not a hard error.
        return;
      }
      if (data.cycle?.rendering) {
        setCyclePhase(
          mode === "session"
            ? "3/3 Episode written — waiting on external render attach…"
            : "3/3 Episode written — rendering video with Higgsfield (1–3 min)…"
        );
        // Unlock the button; polling continues until the clip attaches.
        setTimeout(() => setCyclePhase(null), mode === "session" ? 4000 : 12_000);
      } else if (data.cycle?.renderError) {
        setCyclePhase(null);
        setError(data.cycle.renderError);
      } else {
        setCyclePhase(null);
      }
    } catch (e) {
      setCyclePhase(null);
      if (e instanceof DOMException && e.name === "AbortError") {
        await refresh();
        setError(
          "Cycle timed out waiting for Claude — refresh if a new episode already appeared, then try again."
        );
      } else {
        setError(e instanceof Error ? e.message : "cycle failed");
      }
    } finally {
      clearTimeout(watchdog);
      cycleAbort.current = null;
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] text-[#e8ebf1]">
      <header className="border-b border-[#1e2430]">
        <div className="mx-auto max-w-6xl px-5 py-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <h1 className="text-lg font-bold tracking-tight">
              Patch Notes{" "}
              <span className="text-[#8b93a5] font-normal">
                — the show that ships itself
              </span>
            </h1>
          </div>
          <nav className="ml-auto flex gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  category === c.id
                    ? "bg-[#232b3b] text-white"
                    : "text-[#8b93a5] hover:text-white"
                }`}
              >
                {c.label}
                {!c.live && (
                  <span className="ml-1 text-[10px] text-[#5a6376]">soon</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {category !== "video" ? (
        <div className="mx-auto max-w-2xl px-5 py-24 text-center">
          <p className="text-2xl mb-3">
            {CATEGORIES.find((c) => c.id === category)?.label}
          </p>
          <p className="text-[#8b93a5] leading-relaxed">
            Same loop, different medium: the community votes nightly, an AI
            builds it, QAs it, and ships it to production by morning.
          </p>
          <p className="mt-6 text-sm text-[#5a6376]">
            Video is the pilot. This tab unlocks if it works.
          </p>
        </div>
      ) : !state ? (
        <div className="mx-auto max-w-2xl px-5 py-24 text-center text-[#8b93a5]">
          {error ? `Error: ${error}` : "Loading tonight's episode…"}
        </div>
      ) : (
        <main className="mx-auto max-w-6xl px-5 py-8 grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
          {/* Left: episode player */}
          <section>
            <div
              ref={playerRef}
              className="rounded-2xl overflow-hidden border border-[#1e2430] bg-black relative scroll-mt-4"
            >
              <div className="absolute top-3 left-3 z-10 rounded-md bg-black/70 px-2 py-1 text-[11px] font-mono text-[#ffb347]">
                EP {viewing?.number}
              </div>
              {viewing?.videoUrl ? (
                <>
                  {!videoReady && !videoError && (
                    <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-[#0b0d12]/80 pointer-events-none">
                      <div className="pilot-spinner" aria-hidden />
                      <div className="text-xs font-mono text-[#ffb347]">
                        Loading episode {viewing.number}…
                      </div>
                    </div>
                  )}
                  {videoError && (
                    <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 bg-[#0b0d12] px-6 text-center">
                      <div className="text-xs text-[#ff6b6b]">{videoError}</div>
                      <a
                        href={viewing.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#8fb6ff] underline"
                      >
                        Open video directly
                      </a>
                      <button
                        type="button"
                        className="text-xs text-[#8fb6ff] underline"
                        onClick={() => {
                          setVideoError(null);
                          setVideoReady(false);
                          videoRef.current?.load();
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  {clipEnded && nextEpisode && (
                    <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center">
                      <div className="text-xs font-mono text-[#8b93a5]">
                        END OF EP {viewing.number}
                      </div>
                      <button
                        type="button"
                        onClick={() => selectEpisode(nextEpisode.id)}
                        className="rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white px-5 py-3 text-sm font-semibold"
                      >
                        Next episode → Ep {nextEpisode.number}
                        {nextEpisode.title ? `: ${nextEpisode.title}` : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setClipEnded(false);
                          const el = videoRef.current;
                          if (!el) return;
                          el.currentTime = 0;
                          el.play().catch(() => undefined);
                        }}
                        className="text-xs text-[#8b93a5] hover:text-white"
                      >
                        Replay
                      </button>
                    </div>
                  )}
                  <video
                    key={viewing.videoUrl || viewing.id}
                    ref={videoRef}
                    crossOrigin="anonymous"
                    src={viewing.videoUrl}
                    controls
                    playsInline
                    preload="auto"
                    onLoadedData={markVideoReady}
                    onCanPlay={markVideoReady}
                    onPlaying={markVideoReady}
                    onEnded={onVideoEnded}
                    onError={onVideoError}
                    onPlay={() => {
                      setClipEnded(false);
                      setVideoReady(true);
                    }}
                    className="w-full aspect-[9/16] object-cover bg-black"
                  />
                </>
              ) : (
                <div
                  key={viewing?.id}
                  className="w-full aspect-[9/16] flex flex-col items-center justify-center gap-3 bg-[#0b0d12] px-6 text-center"
                >
                  {viewing?.renderStatus === "rendering" ? (
                    <>
                      <div className="pilot-spinner" aria-hidden />
                      <div className="text-xs font-mono text-[#ffb347]">
                        Rendering episode {viewing.number}…
                      </div>
                      <div className="text-[11px] text-[#5a6376] max-w-xs">
                        Higgsfield render usually takes 1–3 minutes. This page
                        updates when the clip attaches.
                      </div>
                    </>
                  ) : (
                    <div className="text-xs font-mono text-[#ff6b6b]">
                      {viewing?.renderStatus === "failed"
                        ? "Render failed — run cycle again or reset"
                        : "No video yet"}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Chapter scrubber */}
            {state.episodes.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {state.episodes.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => selectEpisode(e.id)}
                    aria-pressed={viewing?.id === e.id}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-mono transition border ${
                      viewing?.id === e.id
                        ? "bg-[#0d9488] text-white border-[#0d9488]"
                        : "bg-[#171b26] text-[#8b93a5] border-transparent hover:text-white hover:bg-[#1b2233]"
                    }`}
                    title={e.title}
                  >
                    Ep {e.number}
                    {e.videoUrl ? "" : e.renderStatus === "rendering" ? " ◉" : ""}
                  </button>
                ))}
                {nextEpisode && (
                  <button
                    type="button"
                    onClick={() => selectEpisode(nextEpisode.id)}
                    className="ml-auto rounded-lg px-2.5 py-1.5 text-xs font-mono border border-[#0d9488]/40 text-[#5eead4] hover:bg-[#0d9488]/15"
                  >
                    Next ep →
                  </button>
                )}
              </div>
            )}

            {viewing?.videoUrl && (
              <a
                href={viewing.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[11px] text-[#8fb6ff] hover:underline"
              >
                Open Ep {viewing.number} video in new tab ↗
              </a>
            )}

            {/* Title / script only after the clip is ready (or if there's no video) */}
            {(videoReady || !viewing?.videoUrl) && (
              <div className="mt-3 px-1">
                <div className="text-xs font-mono text-[#5a6376]">
                  EPISODE {viewing?.number} · SEASON 1
                  {viewing && current && viewing.id !== current.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setViewingId(null);
                        setVideoReady(false);
                      }}
                      className="ml-2 text-[#8fb6ff]"
                    >
                      ← back to latest
                    </button>
                  )}
                </div>
                <h2 className="text-xl font-bold mt-1">{viewing?.title}</h2>
                <p className="text-sm text-[#8b93a5] mt-1">{viewing?.logline}</p>
                {sourceChoice && (
                  <p className="text-[11px] font-mono text-[#0d9488] mt-2">
                    filmed from vote: {sourceChoice.label}
                    {sourceChoice.visualBeat
                      ? ` · ${sourceChoice.visualBeat}`
                      : ""}
                  </p>
                )}
                {nextEpisode && (
                  <button
                    type="button"
                    onClick={() => selectEpisode(nextEpisode.id)}
                    className="mt-3 rounded-lg bg-[#171b26] hover:bg-[#1b2233] border border-[#1e2430] px-3 py-2 text-xs font-mono text-[#5eead4]"
                  >
                    Next episode → Ep {nextEpisode.number}: {nextEpisode.title}
                  </button>
                )}
              </div>
            )}

            {/* Character state */}
            <div className="mt-5 rounded-2xl border border-[#1e2430] bg-[#11141c] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">
                  {state.character.name}&apos;s state
                </h3>
                <span className="text-[10px] font-mono text-[#5a6376]">
                  PERSISTENT THIS SEASON
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#171b26] p-3">
                  <div className="text-[10px] uppercase tracking-wide text-[#5a6376]">Job</div>
                  <div className="mt-0.5 text-sm font-semibold">{state.character.job}</div>
                </div>
                <div className="rounded-xl bg-[#171b26] p-3">
                  <div className="text-[10px] uppercase tracking-wide text-[#5a6376]">Savings</div>
                  <div className="mt-0.5 text-sm font-semibold font-mono">
                    ${state.character.savings.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-[#171b26] p-3">
                  <div className="text-[10px] uppercase tracking-wide text-[#5a6376]">Energy</div>
                  <div className="mt-0.5 text-sm font-semibold font-mono">
                    {state.character.energy}%
                  </div>
                </div>
                <div className="rounded-xl bg-[#171b26] p-3">
                  <div className="text-[10px] uppercase tracking-wide text-[#5a6376]">Social</div>
                  <div className="mt-0.5 text-sm font-semibold">{state.character.social}</div>
                  <div className="text-[11px] text-[#d97706] mt-0.5">
                    Mood: {state.character.mood}
                  </div>
                </div>
              </div>
            </div>

            {/* Episode archive */}
            {state.episodes.length > 1 && (
              <div className="mt-5 rounded-2xl border border-[#1e2430] bg-[#11141c] p-4">
                <h3 className="text-sm font-semibold mb-2">Previously</h3>
                <div className="space-y-1.5">
                  {[...state.episodes].reverse().map((e) => {
                    const w = e.options.find((o) => o.id === e.winnerOptionId);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => selectEpisode(e.id)}
                        className={`w-full text-left text-xs rounded-lg px-2.5 py-2 transition ${
                          viewing?.id === e.id
                            ? "bg-[#1b2233] ring-1 ring-[#0d9488]/40"
                            : "hover:bg-[#161b26]"
                        }`}
                      >
                        <span className="font-mono text-[#5a6376]">
                          Ep {e.number}
                        </span>{" "}
                        <span className="font-semibold">{e.title}</span>
                        {w && (
                          <span className="text-[#5a6376]"> · chose: {w.label}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Right: vote + system */}
          <section className="space-y-6">
            <div className="rounded-2xl border border-[#1e2430] bg-[#11141c] p-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-bold">
                  Tonight&apos;s decision
                  {current ? (
                    <span className="ml-2 font-mono text-xs font-normal text-[#0d9488]">
                      → Ep {current.number + 1}
                    </span>
                  ) : null}
                </h3>
                <span className="text-xs font-mono text-[#ffb347]">
                  {pollClosed ? "poll closed" : `poll closes in ${countdown}`}
                </span>
              </div>
              <p className="text-sm text-[#8b93a5] mt-1 mb-4">
                You&apos;re voting on a <em>pre-baked camera package</em> — the
                winning option&apos;s locked start, action, transition, and final
                frame are what Seedance 2 renders for
                Episode {current ? current.number + 1 : "N+1"}. Or write in your
                own action below; the continuity supervisor normalizes it before
                it can win.
              </p>
              {continuityReady ? (
                <div className="mb-3 rounded-lg border border-[#0d9488]/35 bg-[#0d9488]/10 px-3 py-2 text-[11px] text-[#5eead4]">
                  ✓ Actual ending verified
                  {current?.continuityReview?.travelPhase
                    ? ` · ${current.continuityReview.travelPhase}`
                    : ""}
                  {current?.continuityReview?.mismatches.length
                    ? ` · corrected ${current.continuityReview.mismatches.length} plan mismatch${current.continuityReview.mismatches.length === 1 ? "" : "es"}`
                    : ""}
                </div>
              ) : (
                <div className="mb-3 rounded-xl border border-[#ffb347]/35 bg-[#ffb347]/10 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#ffb347]">
                    {(continuityPhase || current?.continuityReview?.status === "analyzing") && (
                      <span className="pilot-spinner !h-3 !w-3" aria-hidden />
                    )}
                    {continuityPhase ||
                      (current?.renderStatus === "done"
                        ? current?.continuityReview?.status === "failed"
                          ? "Actual-ending review failed"
                          : "Checking what actually happened on screen…"
                        : "Choices unlock after the video and actual-ending review")}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#8b93a5]">
                    Voting is paused until the last three rendered frames agree with
                    the proposed location, travel direction, and next actions.
                  </p>
                  {current?.continuityReview?.status === "failed" && current.videoUrl && (
                    <button
                      type="button"
                      onClick={() => void reconcileCurrentEpisode(current, true)}
                      className="mt-2 text-[11px] font-semibold text-[#8fb6ff] underline"
                    >
                      Retry actual-ending review
                    </button>
                  )}
                </div>
              )}
              <div className={`space-y-2 ${continuityReady ? "" : "hidden"}`}>
                {current?.options.map((o) => {
                  const pct = totalVotes
                    ? Math.round((o.votes / totalVotes) * 100)
                    : 0;
                  const isPicked = yourVote === o.id;
                  const revealed = Boolean(yourVote) || pollClosed;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => vote(o.id)}
                      disabled={revealed || voting || pollClosed || !continuityReady}
                      className={`relative w-full overflow-hidden rounded-xl border p-3 text-left transition ${
                        isPicked
                          ? "border-[#0d9488] bg-[#0d948814]"
                          : "border-[#232b3b] hover:border-[#3a4356]"
                      } ${revealed && !isPicked ? "opacity-60" : ""} ${
                        voting ? "opacity-70" : ""
                      }`}
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-[#1b2233]"
                        style={{
                          width: revealed ? `${pct}%` : "0%",
                          transition: "width .6s ease",
                        }}
                      />
                      <div className="relative flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-sm">{o.label}</div>
                          <div className="text-xs text-[#8b93a5] mt-0.5">
                            {o.detail}
                          </div>
                          {o.visualBeat && (
                            <div className="text-[11px] text-[#0d9488]/90 mt-1 font-mono">
                              film: {o.visualBeat}
                            </div>
                          )}
                          {o.stageDirection && (
                            <div className="text-[11px] text-[#8b93a5] mt-1 leading-snug">
                              stage: {o.stageDirection}
                            </div>
                          )}
                          {o.continuity && (
                            <div className="text-[10px] text-[#ffb347]/90 mt-1 font-mono">
                              continuity: {o.continuity.opening.location} →{" "}
                              {o.continuity.closing.location} ·{" "}
                              {o.continuity.transition.mode}
                            </div>
                          )}
                        </div>
                        {revealed && (
                          <div className="font-mono text-sm shrink-0">{pct}%</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Custom write-in */}
              {!yourVote && !pollClosed && continuityReady && (
                <div className="mt-4 rounded-xl border border-dashed border-[#3a4356] p-3 space-y-2">
                  <div className="text-xs font-semibold text-[#8b93a5]">
                    Write your own option
                  </div>
                  <p className="text-[11px] text-[#5a6376] leading-relaxed">
                    Lock the action before you vote: label + visual beat + exact
                    opening/action/final-pose stage direction. The server anchors
                    it to the current final frame and adds a visible travel bridge
                    if the location changes.
                  </p>
                  <input
                    type="text"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value.slice(0, 48))}
                    placeholder="What should Devon do? (vote label)"
                    maxLength={48}
                    className="w-full rounded-lg border border-[#232b3b] bg-[#0b0d12] px-3 py-2 text-sm outline-none focus:border-[#0d9488]"
                  />
                  <input
                    type="text"
                    value={customDetail}
                    onChange={(e) => setCustomDetail(e.target.value.slice(0, 100))}
                    placeholder="Consequence hint (optional)"
                    maxLength={100}
                    className="w-full rounded-lg border border-[#232b3b] bg-[#0b0d12] px-3 py-2 text-sm outline-none focus:border-[#0d9488]"
                  />
                  <input
                    type="text"
                    value={customVisualBeat}
                    onChange={(e) => setCustomVisualBeat(e.target.value.slice(0, 100))}
                    placeholder='Visual beat — e.g. "sets his phone face-down and meets her eyes"'
                    maxLength={100}
                    className="w-full rounded-lg border border-[#0d9488]/40 bg-[#0b0d12] px-3 py-2 text-sm outline-none focus:border-[#0d9488]"
                  />
                  <textarea
                    value={customStageDirection}
                    onChange={(e) => setCustomStageDirection(e.target.value.slice(0, 220))}
                    placeholder="Stage — continue current pose / action / exact final pose + props (no fades or violence)"
                    maxLength={220}
                    rows={2}
                    className="w-full rounded-lg border border-[#0d9488]/40 bg-[#0b0d12] px-3 py-2 text-sm outline-none focus:border-[#0d9488] resize-none"
                  />
                  <button
                    type="button"
                    onClick={submitCustomOption}
                    disabled={
                      !customLabel.trim() ||
                      !customVisualBeat.trim() ||
                      !customStageDirection.trim() ||
                      voting
                    }
                    className="rounded-lg bg-[#0d9488] px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
                  >
                    {voting ? "Submitting…" : "Add & vote"}
                  </button>
                </div>
              )}

              <div className="mt-3 text-xs text-[#5a6376]">
                {yourVote
                  ? `${totalVotes.toLocaleString()} vote${totalVotes === 1 ? "" : "s"} · yours is in`
                  : `${totalVotes.toLocaleString()} vote${totalVotes === 1 ? "" : "s"} so far`}
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-[#3a4356] bg-[#11141c] p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="font-bold">⚡ Run cycle</h3>
                  <p className="text-xs text-[#8b93a5] mt-1 max-w-md">
                    Fast-forward one night: close the poll, write the next beat
                    from the winning choice, and render the continuity clip
                    (same Devon, new action) on Higgsfield.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={runCycle}
                    disabled={Boolean(cyclePhase) || resetting || !continuityReady}
                    className="rounded-xl bg-[#0d9488] px-4 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {cyclePhase ? "Running…" : "Run one night"}
                  </button>
                  <button
                    type="button"
                    onClick={resetSeason}
                    disabled={resetting || Boolean(cyclePhase)}
                    className="rounded-xl border border-[#5a6376] px-4 py-2.5 text-sm font-semibold text-[#c7cdd9] hover:border-[#ff6b6b] hover:text-[#ff6b6b] disabled:opacity-50"
                  >
                    {resetting ? "Resetting…" : "Reset season"}
                  </button>
                </div>
              </div>
              {cyclePhase && (
                <div className="mt-3 text-xs font-mono text-[#ffb347] animate-pulse">
                  {cyclePhase}
                </div>
              )}
              {error && (
                <div className="mt-3 text-xs text-[#ff6b6b]">{error}</div>
              )}
              {(state.renderMode ?? "consumer") === "session" && (
                <div className="mt-3 text-[11px] text-[#5a6376]">
                  Render mode is <code>session</code> — set{" "}
                  <code className="text-[#8b93a5]">HF_REFRESH_TOKEN</code> on
                  Vercel so &quot;Run one night&quot; submits video itself.
                  Official continuity CLI path:{" "}
                  <code className="text-[#8b93a5]">
                    GET /api/pilot/render?key=…&amp;pending=1
                  </code>{" "}
                  →{" "}
                  <code className="text-[#8b93a5]">/api/pilot/attach</code>.
                </div>
              )}
              {(state.renderMode === "consumer" || state.renderMode === "api") && (
                <div className="mt-3 text-[11px] text-[#5a6376]">
                  Render mode: <code className="text-[#8b93a5]">{state.renderMode}</code>
                  {" "}— video submits when you click Run one night.
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#1e2430] bg-[#11141c] p-5 relative overflow-hidden">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-bold">Feature leaderboard</h3>
                <span className="rounded-full bg-[#232b3b] px-2.5 py-0.5 text-[10px] font-mono text-[#ffb347]">
                  COMING SOON
                </span>
              </div>
              <p className="text-sm text-[#8b93a5] mt-1 mb-4">
                The platform will improve itself too — viewers vote features,
                the AI ships them as real PRs.
              </p>
              <div className="space-y-2 opacity-50 pointer-events-none select-none">
                {FEATURE_IDEAS.map((f, i) => (
                  <div
                    key={f}
                    className="flex items-center gap-3 rounded-xl border border-[#232b3b] p-3"
                  >
                    <span className="font-mono text-xs text-[#5a6376] w-5">
                      #{i + 1}
                    </span>
                    <span className="text-sm flex-1">{f}</span>
                    <span className="font-mono text-xs text-[#8b93a5]">▲</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      )}

      <footer className="border-t border-[#1e2430] py-6 text-center text-xs text-[#5a6376]">
        A SelfImprove experiment — one AI writes the show, renders the video,
        and ships the platform. Daily.
      </footer>
    </div>
  );
}
