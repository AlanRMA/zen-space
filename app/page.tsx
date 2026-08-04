"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Mode = "zen" | "smart";
type Theme = "dark" | "light";
type Tab = "inicio" | "dados";
type CheckpointChoice = "focus" | "distraction" | "sleep";

type BreathSetup = {
  inhale: number;
  holdIn: number;
  exhale: number;
  holdOut: number;
};

type Session = {
  id: string;
  endedAt: string;
  durationSeconds: number;
  mode: Mode;
  breath: BreathSetup;
  focused: number;
  checkpoints: number;
};

const STORAGE_KEY = "zen-space-sessions-v1";
const THEME_KEY = "zen-space-theme-v1";
const DEFAULT_BREATH: BreathSetup = { inhale: 4, holdIn: 2, exhale: 4, holdOut: 2 };

const pad = (value: number) => String(value).padStart(2, "0");

function formatTimer(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}min ${rest}s` : `${minutes}min`;
}

function breathLabel(breath: BreathSetup) {
  return `${breath.inhale}-${breath.holdIn}-${breath.exhale}-${breath.holdOut}`;
}

function playChime(audioContextRef: React.MutableRefObject<AudioContext | null>) {
  try {
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    void context.resume();

    [0, 0.16, 0.34].forEach((delay, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = [659.25, 783.99, 987.77][index];
      const start = context.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.8);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.82);
    });
  } catch {
    // Meditation remains usable when a browser blocks audio.
  }
}

export default function Home() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [tab, setTab] = useState<Tab>("inicio");
  const [mode, setMode] = useState<Mode>("zen");
  const [breath, setBreath] = useState<BreathSetup>(DEFAULT_BREATH);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [practiceActive, setPracticeActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [checkpointChoice, setCheckpointChoice] = useState<CheckpointChoice | null>(null);
  const [focused, setFocused] = useState(0);
  const [checkpoints, setCheckpoints] = useState(0);
  const [period, setPeriod] = useState<"7" | "30" | "all">("30");
  const checkpointTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckpointRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSessions(JSON.parse(stored));
      const storedTheme = localStorage.getItem(THEME_KEY) as Theme | null;
      if (storedTheme === "light" || storedTheme === "dark") {
        setTheme(storedTheme);
      } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        setTheme("light");
      }
    } catch {
      // Local persistence is an enhancement; the session can still run.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* no-op */ }
  }, [theme]);

  useEffect(() => {
    if (!practiceActive) return;
    const interval = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(interval);
  }, [practiceActive, startedAt]);

  useEffect(() => {
    if (!practiceActive || mode !== "smart" || elapsed < 120) return;
    const checkpointNumber = Math.floor(elapsed / 120);
    if (checkpointNumber <= lastCheckpointRef.current) return;
    lastCheckpointRef.current = checkpointNumber;
    setCheckpoints((value) => value + 1);
    setCheckpointChoice(null);
    setCheckpointOpen(true);
    playChime(audioContextRef);
    if (checkpointTimerRef.current) clearTimeout(checkpointTimerRef.current);
    checkpointTimerRef.current = setTimeout(() => setCheckpointOpen(false), 30000);
  }, [elapsed, mode, practiceActive]);

  const endPractice = useCallback(() => {
    if (!practiceActive) return;
    const durationSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    const newSession: Session = {
      id: crypto.randomUUID(),
      endedAt: new Date().toISOString(),
      durationSeconds,
      mode,
      breath,
      focused,
      checkpoints,
    };
    setSessions((current) => {
      const next = [newSession, ...current];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* no-op */ }
      return next;
    });
    setPracticeActive(false);
    setCheckpointOpen(false);
    setCheckpointChoice(null);
    setTab("dados");
    if (checkpointTimerRef.current) clearTimeout(checkpointTimerRef.current);
  }, [breath, checkpoints, focused, mode, practiceActive, startedAt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!practiceActive || mode !== "smart" || !checkpointOpen) return;
      const choice = event.key === "1" ? "focus" : event.key === "2" ? "distraction" : event.key === "3" ? "sleep" : null;
      if (!choice) return;
      event.preventDefault();
      setCheckpointChoice(choice);
      if (choice === "focus") setFocused((value) => value + 1);
      setCheckpointOpen(false);
      if (checkpointTimerRef.current) clearTimeout(checkpointTimerRef.current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [checkpointOpen, mode, practiceActive]);

  const startPractice = () => {
    const now = Date.now();
    setStartedAt(now);
    setElapsed(0);
    setFocused(0);
    setCheckpoints(0);
    setCheckpointOpen(false);
    setCheckpointChoice(null);
    lastCheckpointRef.current = 0;
    if (mode === "smart") playChime(audioContextRef);
    setPracticeActive(true);
  };

  const chooseCheckpoint = (choice: CheckpointChoice) => {
    if (!checkpointOpen) return;
    setCheckpointChoice(choice);
    if (choice === "focus") setFocused((value) => value + 1);
    setCheckpointOpen(false);
    if (checkpointTimerRef.current) clearTimeout(checkpointTimerRef.current);
  };

  const updateBreath = (key: keyof BreathSetup, value: number) => {
    const safe = Math.min(20, Math.max(key === "inhale" || key === "exhale" ? 1 : 0, value || 0));
    setBreath((current) => ({ ...current, [key]: safe }));
  };

  const breathPhase = useMemo(() => {
    const phases = [
      { key: "inhale", label: "Inspire", duration: breath.inhale },
      { key: "holdIn", label: "Segure", duration: breath.holdIn },
      { key: "exhale", label: "Expire", duration: breath.exhale },
      { key: "holdOut", label: "Aguarde", duration: breath.holdOut },
    ].filter((phase) => phase.duration > 0);
    const cycle = phases.reduce((sum, phase) => sum + phase.duration, 0) || 1;
    let within = elapsed % cycle;
    let selected = phases[0];
    for (const phase of phases) {
      if (within < phase.duration) { selected = phase; break; }
      within -= phase.duration;
    }
    const progress = selected ? within / selected.duration : 0;
    const scale = selected?.key === "inhale" ? 0.58 + progress * 0.42
      : selected?.key === "exhale" ? 1 - progress * 0.42
      : selected?.key === "holdIn" ? 1 : 0.58;
    const remaining = selected ? Math.max(1, Math.ceil(selected.duration - within)) : 1;
    return { label: selected?.label ?? "Respire", scale, remaining };
  }, [breath, elapsed]);

  const filteredSessions = useMemo(() => {
    if (period === "all") return sessions;
    const cutoff = Date.now() - Number(period) * 86400000;
    return sessions.filter((session) => new Date(session.endedAt).getTime() >= cutoff);
  }, [period, sessions]);

  const totalSeconds = filteredSessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const smartSessions = filteredSessions.filter((session) => session.mode === "smart" && session.checkpoints > 0);
  const totalSmartCheckpoints = smartSessions.reduce((sum, session) => sum + session.checkpoints, 0);
  const totalFocused = smartSessions.reduce((sum, session) => sum + session.focused, 0);
  const overallPresence = totalSmartCheckpoints ? Math.round((totalFocused / totalSmartCheckpoints) * 100) : null;

  if (practiceActive) {
    return (
      <main className="practice-shell">
        <div className="practice-topbar">
          <span className="brand-mark" aria-hidden="true" />
          <span className="practice-mode">MODO {mode.toUpperCase()}</span>
          <button className="quiet-button" onClick={endPractice} aria-label="Encerrar e salvar sessão">Encerrar</button>
        </div>

        <section className="practice-center" aria-live="polite">
          <div className="breath-stage">
            <div className="breath-orbit orbit-one" />
            <div className="breath-orbit orbit-two" />
            <div className="breath-circle" style={{ transform: `scale(${breathPhase.scale})` }}>
              <span>{breathPhase.label}</span>
              <strong>{breathPhase.remaining}</strong>
            </div>
          </div>
          <div className="practice-timer">{formatTimer(elapsed)}</div>
          <div className="practice-breath-label">Respiração {breathLabel(breath)}</div>
        </section>

        {mode === "smart" && (
          <section className={`checkpoint-panel ${checkpointOpen ? "is-open" : ""}`} aria-label="Checkpoint de presença">
            <div className="checkpoint-copy">
              <span>{checkpointOpen ? "Agora" : checkpointChoice ? "Registrado" : "Próximo checkpoint"}</span>
              <strong>{checkpointOpen ? "Onde está sua mente?" : checkpointChoice ? "Volte gentilmente." : `${formatTimer(120 - (elapsed % 120))}`}</strong>
            </div>
            <div className="checkpoint-buttons">
              {([
                ["focus", "1", "Foco"],
                ["distraction", "2", "Distração"],
                ["sleep", "3", "Sono"],
              ] as const).map(([choice, key, label]) => (
                <button key={choice} disabled={!checkpointOpen} className={checkpointChoice === choice ? "selected" : ""} onClick={() => chooseCheckpoint(choice)}>
                  <kbd>{key}</kbd><span>{label}</span>
                </button>
              ))}
            </div>
            <div className="live-presence">
              Presença <strong>{checkpoints ? Math.round((focused / checkpoints) * 100) : 0}%</strong>
              <span>{focused}/{checkpoints} checkpoints focados</span>
            </div>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => setTab("inicio")} aria-label="Ir para o início">
          <span className="brand-mark" aria-hidden="true" />
          <span>ZEN SPACE</span>
        </button>
        <nav className="nav-tabs" aria-label="Navegação principal">
          <button className={tab === "inicio" ? "active" : ""} onClick={() => setTab("inicio")}>Prática</button>
          <button className={tab === "dados" ? "active" : ""} onClick={() => setTab("dados")}>Dados</button>
        </nav>
        <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Ativar modo ${theme === "dark" ? "claro" : "escuro"}`}>
          <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
        </button>
      </header>

      {tab === "inicio" ? (
        <div className="dashboard-layout">
          <section className="hero-panel">
            <div className="eyebrow">UM ESPAÇO PARA VOLTAR</div>
            <h1>Sua atenção<br /><em>começa aqui.</em></h1>
            <p>Respire no seu ritmo. Observe sem julgar. Cada sessão fica guardada apenas neste dispositivo.</p>
            <div className="hero-stats">
              <div><strong>{sessions.length}</strong><span>sessões</span></div>
              <div><strong>{Math.round(sessions.reduce((sum, item) => sum + item.durationSeconds, 0) / 60)}</strong><span>minutos</span></div>
            </div>
          </section>

          <section className="setup-card">
            <div className="setup-heading">
              <div><span className="section-number">01</span><h2>Escolha o modo</h2></div>
              <span className="mode-pill">{mode === "zen" ? "silêncio" : "presença"}</span>
            </div>
            <div className="mode-selector">
              <button className={mode === "zen" ? "selected" : ""} onClick={() => setMode("zen")}>
                <span className="mode-icon">○</span><strong>Zen</strong><small>Apenas respiração e tempo.</small>
              </button>
              <button className={mode === "smart" ? "selected" : ""} onClick={() => setMode("smart")}>
                <span className="mode-icon">⌁</span><strong>Smart</strong><small>Checkpoints a cada 2 min.</small>
              </button>
            </div>

            <div className="setup-divider" />

            <div className="setup-heading compact">
              <div><span className="section-number">02</span><h2>Configure a respiração</h2></div>
              <span className="breath-code">{breathLabel(breath)}</span>
            </div>
            <div className="breath-inputs">
              {([
                ["inhale", "Inspirar", "ar entra"],
                ["holdIn", "Segurar", "pulmões cheios"],
                ["exhale", "Expirar", "ar sai"],
                ["holdOut", "Aguardar", "pulmões vazios"],
              ] as const).map(([key, label, hint]) => (
                <label key={key}>
                  <span>{label}</span>
                  <div><input type="number" inputMode="numeric" min={key === "inhale" || key === "exhale" ? 1 : 0} max="20" value={breath[key]} onChange={(event) => updateBreath(key, Number(event.target.value))} /><small>seg</small></div>
                  <em>{hint}</em>
                </label>
              ))}
            </div>
            <p className="breath-tip">Os tempos de espera podem ser zero.</p>
            <button className="start-button" onClick={startPractice}>
              <span>Iniciar prática</span><span className="start-arrow">↗</span>
            </button>
          </section>

          <section className="recent-strip">
            <div><span className="section-number">03</span><h2>Última prática</h2></div>
            {sessions[0] ? (
              <div className="last-session">
                <strong>{formatDuration(sessions[0].durationSeconds)}</strong>
                <span>{sessions[0].mode === "zen" ? "Modo Zen" : `Smart · ${sessions[0].checkpoints ? Math.round((sessions[0].focused / sessions[0].checkpoints) * 100) : 0}% presença`}</span>
                <time>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(sessions[0].endedAt))}</time>
              </div>
            ) : <p className="empty-inline">Seu histórico começa depois da primeira sessão.</p>}
          </section>
        </div>
      ) : (
        <div className="data-view">
          <section className="data-heading">
            <div><span className="eyebrow">SEU RITMO, SEM JULGAMENTO</span><h1>Dados da prática</h1></div>
            <div className="period-filter" aria-label="Filtrar período">
              <button className={period === "7" ? "active" : ""} onClick={() => setPeriod("7")}>7 dias</button>
              <button className={period === "30" ? "active" : ""} onClick={() => setPeriod("30")}>30 dias</button>
              <button className={period === "all" ? "active" : ""} onClick={() => setPeriod("all")}>Tudo</button>
            </div>
          </section>

          <section className="metric-grid">
            <article><span>Sessões no período</span><strong>{filteredSessions.length}</strong><small>práticas concluídas</small></article>
            <article><span>Tempo de presença</span><strong>{Math.round(totalSeconds / 60)}<em> min</em></strong><small>{formatDuration(totalSeconds)} no total</small></article>
            <article><span>Taxa de presença</span><strong>{overallPresence === null ? "—" : `${overallPresence}%`}</strong><small>{overallPresence === null ? "Disponível no modo Smart" : `${totalFocused} de ${totalSmartCheckpoints} checkpoints`}</small></article>
          </section>

          <section className="history-card">
            <div className="history-title"><h2>Histórico</h2><span>{filteredSessions.length} registros locais</span></div>
            {filteredSessions.length ? (
              <div className="session-list">
                {filteredSessions.map((session) => {
                  const presence = session.checkpoints ? Math.round((session.focused / session.checkpoints) * 100) : null;
                  return (
                    <article className="session-row" key={session.id}>
                      <div className="session-date"><strong>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(new Date(session.endedAt))}</strong><span>{new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(session.endedAt)).replace(".", "")}</span></div>
                      <div className="session-kind"><span className="session-dot" /><div><strong>Modo {session.mode === "zen" ? "Zen" : "Smart"}</strong><small>{new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(session.endedAt))}</small></div></div>
                      <div className="session-cell"><span>Duração</span><strong>{formatDuration(session.durationSeconds)}</strong></div>
                      <div className="session-cell"><span>Respiração</span><strong>{breathLabel(session.breath)}</strong></div>
                      <div className="session-cell"><span>Presença</span><strong>{presence === null ? "—" : `${presence}%`}</strong></div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state"><span className="empty-circle" /><h3>Um começo tranquilo</h3><p>Conclua uma prática para ver seus dados aqui.</p><button onClick={() => setTab("inicio")}>Começar agora</button></div>
            )}
          </section>
          <p className="privacy-note">Seus dados ficam somente no cache deste dispositivo.</p>
        </div>
      )}
    </main>
  );
}
