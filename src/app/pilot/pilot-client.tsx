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
};
type Episode = {
  id: string;
  number: number;
  title: string;
  logline: string;
  script: string;
  videoUrl: string | null;
  posterUrl: string;
  renderStatus: "none" | "rendering" | "done" | "failed";
  options: Option[];
  winnerOptionId: string | null;
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
  renderMode?: "session" | "api" | "off";
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
  const [resetting, setResetting] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const playerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cycleAbort = useRef<AbortController | null>(null);

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

  // Poll while the latest episode is awaiting video (session attach or API job).
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

    const mode = state?.renderMode ?? "session";
    pollTimer.current = setInterval(async () => {
      if (mode === "api") {
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
        }
      } else {
        const data = await refresh();
        const ep = data?.episodes.find((e) => e.id === current.id);
        if (ep && ep.renderStatus !== "rendering") {
          setCyclePhase(null);
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

  function selectEpisode(id: string) {
    setVideoReady(false);
    setViewingId(id);
    requestAnimationFrame(() => {
      playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // When the active episode changes, force the <video> element to load that
  // clip and skip the shared seed first-frame so chapter switches are obvious.
  useEffect(() => {
    setVideoReady(false);
    const el = videoRef.current;
    if (!el || !viewing?.videoUrl) return;

    el.pause();
    el.removeAttribute("src");
    el.load();
    el.src = viewing.videoUrl;
    el.load();

    const onReady = () => {
      try {
        // i2v from the same seed often looks identical at t=0 — jump in.
        if (el.duration && el.duration > 1) el.currentTime = 0.6;
      } catch {
        /* ignore seek errors */
      }
      setVideoReady(true);
      el.play().catch(() => undefined);
    };

    el.addEventListener("loadeddata", onReady, { once: true });
    return () => el.removeEventListener("loadeddata", onReady);
  }, [viewing?.id, viewing?.videoUrl]);

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
    if (!current || !label || !visual || yourVote || voting || pollClosed) return;
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
      const mode = data.cycle?.renderMode ?? data.renderMode ?? "session";
      if (data.cycle?.recovered) {
        setCyclePhase(null);
        // Soft sync after a double-click / in-flight cycle — not a hard error.
        return;
      }
      if (data.cycle?.rendering) {
        setCyclePhase(
          mode === "session"
            ? "3/3 Episode written — queued for consumer video render…"
            : "3/3 Episode written — rendering video (2-5 min)…"
        );
        // Don't leave the button locked forever in session mode.
        setTimeout(() => setCyclePhase(null), 4000);
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
                {viewing?.title ? ` · ${viewing.title}` : ""}
              </div>
              {viewing?.videoUrl ? (
                <>
                  {!videoReady && (
                    <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center bg-[#0b0d12] px-6 text-center">
                      <div className="text-xs font-mono text-[#ffb347] mb-2">
                        LOADING EP {viewing.number}
                      </div>
                      <div className="text-sm font-semibold">{viewing.title}</div>
                      <div className="mt-2 text-xs text-[#8b93a5] max-w-xs">
                        {viewing.logline}
                      </div>
                    </div>
                  )}
                  <video
                    key={viewing.id}
                    ref={videoRef}
                    controls
                    playsInline
                    preload="auto"
                    className="w-full aspect-[9/16] object-cover bg-black"
                  />
                </>
              ) : (
                <div
                  key={viewing?.id}
                  className="w-full aspect-[9/16] bg-cover bg-center flex items-end"
                  style={{ backgroundImage: `url(${viewing?.posterUrl})` }}
                >
                  <div className="w-full bg-gradient-to-t from-black/90 to-transparent p-4 pt-16">
                    <div className="text-xs font-mono text-[#ffb347] mb-2">
                      {viewing?.renderStatus === "rendering"
                        ? state.renderMode === "session"
                          ? "◉ AWAITING CONSUMER RENDER — session will attach the video"
                          : "◉ RENDERING — the video is being generated"
                        : viewing?.renderStatus === "failed"
                        ? "✕ RENDER FAILED — script-only episode"
                        : "SCRIPT-ONLY EPISODE"}
                    </div>
                    <p className="text-sm leading-relaxed text-[#c7cdd9]">
                      {viewing?.script}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Chapter scrubber — click any episode to load it in the player */}
            {state.episodes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
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
              </div>
            )}

            <div className="mt-3 px-1">
              <div className="text-xs font-mono text-[#5a6376]">
                EPISODE {viewing?.number} · SEASON 1
                {viewing && current && viewing.id !== current.id && (
                  <button
                    type="button"
                    onClick={() => setViewingId(null)}
                    className="ml-2 text-[#8fb6ff]"
                  >
                    ← back to latest
                  </button>
                )}
              </div>
              <h2 className="text-xl font-bold mt-1">{viewing?.title}</h2>
              <p className="text-sm text-[#8b93a5] mt-1">{viewing?.logline}</p>
              {viewing?.videoUrl && (
                <p className="mt-3 text-sm leading-relaxed text-[#9aa3b5]">
                  {viewing.script}
                </p>
              )}
            </div>

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
                <h3 className="font-bold">Tonight&apos;s decision</h3>
                <span className="text-xs font-mono text-[#ffb347]">
                  {pollClosed ? "poll closed" : `poll closes in ${countdown}`}
                </span>
              </div>
              <p className="text-sm text-[#8b93a5] mt-1 mb-4">
                The winner becomes the next episode — written, rendered, and
                published autonomously. Or write in your own option below.
              </p>
              <div className="space-y-2">
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
                      disabled={revealed || voting || pollClosed}
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
              {!yourVote && !pollClosed && (
                <div className="mt-4 rounded-xl border border-dashed border-[#3a4356] p-3 space-y-2">
                  <div className="text-xs font-semibold text-[#8b93a5]">
                    Write your own option
                  </div>
                  <p className="text-[11px] text-[#5a6376] leading-relaxed">
                    Include a visual beat so the next video matches your choice —
                    image-to-video can only film Devon in close-up, not the whole bar.
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
                  <button
                    type="button"
                    onClick={submitCustomOption}
                    disabled={!customLabel.trim() || !customVisualBeat.trim() || voting}
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
                    Test control: fast-forward one night. Closes the poll,
                    Claude writes the next beat from the winning vote, then
                    queues video for the Higgsfield consumer render session.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={runCycle}
                    disabled={Boolean(cyclePhase) || resetting}
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
              {(state.renderMode ?? "session") === "session" && (
                <div className="mt-3 text-[11px] text-[#5a6376]">
                  Video uses the Higgsfield consumer app (CLI/MCP), not platform
                  API keys. Pending jobs:{" "}
                  <code className="text-[#8b93a5]">
                    GET /api/pilot/render?key=…&amp;pending=1
                  </code>{" "}
                  → attach via{" "}
                  <code className="text-[#8b93a5]">/api/pilot/attach</code>.
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
