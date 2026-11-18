import { mountGameSwitch } from '../../../../game-switch/client';
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import type {
  GameView,
  RoomView,
} from "../../../packages/shared-types/src/index";
import {
  useApp,
  act,
  connect,
  enter,
  leave,
  run,
  readLocal,
  invitationUrl,
  writeLocal,
  socket,
} from "./store";
import { copy, type Language, type Copy } from "./i18n";
import "@fontsource/special-elite";
import "@fontsource/nanum-gothic-coding";
import "@fontsource/nanum-gothic-coding/700.css";
import "@fontsource/stardos-stencil";
import "@fontsource/noto-serif-kr/400.css";
import "@fontsource/noto-serif-kr/600.css";
import "@fontsource/noto-serif-kr/900.css";
import { Portrait, Emblem, PolicyFace, ARCHETYPES } from "./Art";
import { PolicyCard } from "./PolicyCard";
import { LegislationProgress } from "./LegislationProgress";
import { ActivityProgress } from "./ActivityProgress";
import { GovernmentProposal } from "./GovernmentProposal";
import { Presentation, VoteScene, useScenes, useTyped, playCue } from "./Presentation";
import { Rulebook } from "./Rulebook";
import { layoutSeats, slotFor } from "./seatLayout";
import "./styles.css";
import "./stage.css";

function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button aria-label="Close" onClick={close}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Home({ t }: { t: Copy }) {
  const [introSkipped, setIntroSkipped] = useState(false),
    [soundOn, setSoundOn] = useState(readLocal("sh-sound", "0") === "1");
  const calm =
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.body.dataset.reduce === "true";
  // S0: dark → lamp lights → title is typed → "극비" stamp lands
  const typed = useTyped("SECRET HITLER", !introSkipped && !calm, 95, 1100),
    lastLen = useRef(0);
  useEffect(() => {
    if (introSkipped || calm) return;
    document.body.dataset.intro = "true";
    const a = setTimeout(() => delete document.body.dataset.intro, 900),
      b = setTimeout(() => playCue("stamp"), 2700);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      delete document.body.dataset.intro;
    };
  }, [introSkipped, calm]);
  useEffect(() => {
    if (!introSkipped && !calm && typed.length > lastLen.current && typed.trim())
      playCue("tick");
    lastLen.current = typed.length;
  }, [typed, introSkipped, calm]);
  const [name, setName] = useState(readLocal("sh-name", "")),
    [avatar, setAvatar] = useState(Number(readLocal("sh-avatar", "0")) || 0);
  const [code, setCode] = useState(
      new URLSearchParams(location.search).get("room") ?? "",
    ),
    [spectator, setSpectator] = useState(false);
  const { busy, connected } = useApp();
  const profile = () => {
    writeLocal("sh-name", name);
    writeLocal("sh-avatar", String(avatar));
    return { name: name.trim(), avatar, language: t === copy.en ? "en" : "ko" };
  };
  return (
    <main
      className="home"
      data-skip={introSkipped}
      onPointerDown={() => setIntroSkipped(true)}
    >
      <div className="home-scene" aria-hidden="true">
        <div className="blinds" />
        <div className="home-folder">
          <span>
            REICHSTAG<br />
            ARCHIV / 1932
          </span>
          <Emblem party="fascist" size={150} />
          <b>{t.topSecret}</b>
          <small>AKTE № 017—SH</small>
        </div>
        <div className="home-notes">
          PROTOKOLL
          <br />
          ________________________________
          <br />
          ________________________________
          <br />
          ________________________________
          <br />
          ________________________________
        </div>
        <div className="reel" />
      </div>
      <section className="home-content">
        <p className="eyebrow">{t.tag}</p>
        <h1 aria-label="SECRET HITLER">
          <i className="ty" aria-hidden="true">
            {typed.slice(0, 6)}
            <br />
            <span>{typed.slice(7)}</span>
            {typed.length < 13 && <b className="caret" />}
          </i>
        </h1>
        <p className="korean-title">{t.title}</p>
        <p className="subtitle">{t.sub}</p>
        <button
          type="button"
          className="sound-prompt"
          aria-pressed={soundOn}
          onClick={() => {
            const next = readLocal("sh-sound", "0") !== "1";
            writeLocal("sh-sound", next ? "1" : "0");
            setSoundOn(next);
            window.dispatchEvent(new Event("sh-sound"));
          }}
        >
          {soundOn ? "◖)) " + t.soundOn : "◖× " + t.soundPrompt}
        </button>
        <div className="home-facts">
          <span>05—10 PLAYERS</span>
          <span>30—45 MIN</span>
          <span>REAL-TIME</span>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enter("CREATE_ROOM", profile());
          }}
        >
          <label>
            {t.name}
            <input
              autoComplete="nickname"
              maxLength={20}
              placeholder={t.name}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <fieldset className="avatar-picker">
            <legend>{t.avatar}</legend>
            {ARCHETYPES.map((a, i) => (
              <button
                key={a}
                type="button"
                className={avatar === i ? "selected" : ""}
                aria-label={a}
                aria-pressed={avatar === i}
                title={a}
                onClick={() => setAvatar(i)}
              >
                <Portrait avatar={i} />
              </button>
            ))}
          </fieldset>
          <button
            className="primary full"
            disabled={busy || !connected || !name.trim()}
            type="submit"
          >
            {t.create}
            <span>↗</span>
          </button>
        </form>
        <div className="join-form">
          <label>
            {t.code}
            <input
              value={code}
              autoComplete="off"
              maxLength={6}
              placeholder="XXXXXX"
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))
              }
            />
          </label>
          <button
            disabled={busy || !connected || !name.trim() || code.length !== 6}
            onClick={() =>
              void enter("JOIN_ROOM", { ...profile(), code, spectator })
            }
          >
            {t.join}
          </button>
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={spectator}
            onChange={(e) => setSpectator(e.target.checked)}
          />
          {t.spectate}
        </label>
        <p className="fine-print">{t.voiceNote}</p>
      </section>
    </main>
  );
}
function Lobby({ room, t }: { room: RoomView; t: Copy }) {
  const self = room.members.find((p) => p.id === room.selfId)!,
    host = room.hostId === room.selfId,
    { busy } = useApp();
  const [copied, setCopied] = useState(false), [showInvite, setShowInvite] = useState(false);
  const players = room.members.filter((m) => !m.spectator),
    ready = players.filter((p) => p.ready && p.connected).length;
  const settings = (key: string, value: string | number) =>
    void run("SETTINGS", { ...room.settings, [key]: value });
  return (
    <main className="lobby content">
      <div className="section-title">
        <div>
          <p className="eyebrow">ASSEMBLY / WAITING ROOM</p>
          <h1>{t.lobby}</h1>
        </div>
        <div className="registration">
          <small>{t.code}</small>
          <strong>{room.code}</strong>
          <button onClick={async () => {
            const url = invitationUrl(room.code);
            if (navigator.share) {
              try { await navigator.share({ title: t.title, text: t.shareText, url }); return; }
              catch (error) { if ((error as Error).name === "AbortError") return; }
            }
            setShowInvite(true);
          }}>{t.shareInvite} ↗</button>
          <button onClick={async () => {
            try {
              await navigator.clipboard.writeText(invitationUrl(room.code));
              setCopied(true);
              setTimeout(() => setCopied(false), 3000);
            } catch { setShowInvite(true); }
          }}>{copied ? t.copied : t.invite}</button>
          {showInvite && <label className="invite-url">{t.inviteFallback}
            <input readOnly value={invitationUrl(room.code)} onFocus={(e) => e.currentTarget.select()} />
          </label>}
        </div>
      </div>
      <div ref={mountGameSwitch} className="club-switch-slot" />
      <div className="lobby-layout">
        <section>
          <div className="roster-title">
            <span>
              {players.length} / {room.settings.maxPlayers} DELEGATES
            </span>
            <span>
              {t.readyCount} {ready}/{players.length}
            </span>
          </div>
          <div className="roster">
            {players.map((p, i) => (
              <article
                className={`dossier ${p.ready ? "ready" : ""}`}
                key={p.id}
              >
                <div className="file-number">
                  AKTE {String(i + 1).padStart(2, "0")}
                  {p.id === room.selfId && " / YOU"}
                </div>
                <Portrait avatar={p.avatar} />
                <div className="identity">
                  <h3>{p.name}</h3>
                  <small>
                    {p.id === room.hostId
                      ? t.host
                      : p.bot
                        ? t.bot
                        : t.connected}
                  </small>
                  <p>{!p.connected ? t.offline : p.ready ? t.ready : "—"}</p>
                </div>
                {host && p.id !== room.selfId && (
                  <button
                    className="kick"
                    aria-label={`${p.name} ${t.kick}`}
                    onClick={() => void run("KICK", { id: p.id })}
                  >
                    ×
                  </button>
                )}
              </article>
            ))}
            {Array.from({ length: Math.max(0, 5 - players.length) }, (_, i) => (
              <div className="empty-file" key={i}>
                AWAITING DELEGATE
              </div>
            ))}
          </div>
          {host && (
            <button
              aria-label={t.addBot}
              className="dashed"
              disabled={busy || players.length >= room.settings.maxPlayers}
              onClick={() => void run("ADD_BOT")}
            >
              ＋ {t.addBot}
            </button>
          )}
          <p className="fine-print">{t.trainingNote}</p>
          {room.members.some((p) => p.spectator) && (
            <p className="fine-print">
              {t.spectator}:{" "}
              {room.members
                .filter((p) => p.spectator)
                .map((p) => p.name)
                .join(", ")}
            </p>
          )}
        </section>
        <aside className="paper settings">
          <p className="eyebrow">SESSION PARAMETERS</p>
          <h2>{t.settings}</h2>
          <label>
            {t.capacity}
            <select
              value={room.settings.maxPlayers}
              disabled={!host || busy}
              onChange={(e) => settings("maxPlayers", Number(e.target.value))}
            >
              {[5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.timer}
            <select
              value={room.settings.timerSeconds}
              disabled={!host || busy}
              onChange={(e) => settings("timerSeconds", Number(e.target.value))}
            >
              {[0, 30, 60, 120].map((n) => (
                <option key={n} value={n}>
                  {n ? `${n}s` : t.off}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.language}
            <select
              disabled={!host || busy}
              value={room.settings.language}
              onChange={(e) => settings("language", e.target.value)}
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </label>
          <p className="fine-print">{t.timerNote}</p>
          <div className="rule-divider" />
          <div className="balance">
            <span>
              <Emblem party="liberal" size={32} />
              {t.liberal}
            </span>
            <span>
              <Emblem party="fascist" size={32} />
              {t.fascist}
            </span>
          </div>
          <p className="fine-print">
            5—6: 3/4 L · 1 F · 1 H<br />
            7—8: 4/5 L · 2 F · 1 H<br />
            9—10: 5/6 L · 3 F · 1 H
          </p>
          {!self.spectator && (
            <button
              className="full"
              disabled={busy}
              onClick={() => void run("READY", { ready: !self.ready })}
            >
              {self.ready ? t.unready : t.ready}
            </button>
          )}
          {host && (
            <button
              className="primary full"
              disabled={busy || players.length < 5 || ready !== players.length}
              onClick={() => void run("START")}
            >
              {t.start} →
            </button>
          )}
        </aside>
      </div>
    </main>
  );
}
function SecretFile({
  g,
  selfId,
  t,
}: {
  g: GameView;
  selfId: string;
  t: Copy;
}) {
  const [open, setOpen] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reveal = () => {
    if (holdTimer.current) return;
    holdTimer.current = setTimeout(() => setOpen(true), 300);
  };
  const seal = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setOpen(false);
  };
  useEffect(() => {
    const hide = seal;
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", hide);
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  if (!g.selfRole) return <p className="notice">{t.spectatorNote}</p>;
  return (
    <div className="secret-file">
      <button
        className={`hold-file ${open ? `opened ${g.selfRole}` : ""}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          reveal();
        }}
        onPointerUp={seal}
        onPointerCancel={seal}
        onLostPointerCapture={seal}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            if (!e.repeat) reveal();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            seal();
          }
        }}
        onBlur={seal}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="file-seal">
          {open ? t.declassified : t.topSecret}
        </span>
        {open ? (
          <>
            <Emblem party={g.selfRole} size={76} />
            <h2>{t[g.selfRole]}</h2>
            <p>{g.knownPlayers.length ? t.allies : t.noAllies}</p>
            {g.knownPlayers.map((p) => (
              <div key={p.id} className="ally-line">
                {g.players.find((q) => q.id === p.id)?.name} · {t[p.role]}
              </div>
            ))}
          </>
        ) : (
          <>
            <span className="envelope" aria-hidden="true" />
            <strong>{t.hold}</strong>
            <small>{t.release}</small>
          </>
        )}
      </button>
      {g.phase === "night" &&
        (g.acknowledged.includes(selfId) ? (
          <p>
            {t.ackDone} {g.acknowledged.length}/{g.players.length}
          </p>
        ) : (
          <button
            className="primary full"
            onClick={() => act({ type: "acknowledge" })}
          >
            {t.ack}
          </button>
        ))}
    </div>
  );
}

function Track({
  g,
  t,
  full = false,
}: {
  g: GameView;
  t: Copy;
  full?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pips = (n: number, have: number) =>
    Array.from({ length: n }, (_, i) => <i key={i} className={i < have ? "on" : ""} />);
  const powers =
    g.players.length <= 6
      ? [null, null, "peek", "execute", "execute", null]
      : g.players.length <= 8
        ? [null, "investigate", "special_election", "execute", "execute", null]
        : [
            "investigate",
            "investigate",
            "special_election",
            "execute",
            "execute",
            null,
          ];
  const short = (p: string | null) =>
    p === "investigate"
      ? t.investigateShort
      : p === "special_election"
        ? t.specialShort
        : p === "peek"
          ? t.peekShort
          : p === "execute"
            ? t.execute
            : "";
  return (
    <section
      className={`policy-board ledger ${open ? "open" : ""} ${full ? "static" : ""} ${g.tracker >= 2 ? "tracker-warn" : ""}`}
      aria-label={`${t.liberal} / ${t.fascist}`}
    >
      <button
        className="ledger-mini"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="lm lib">
          <Emblem party="liberal" size={20} />
          {pips(5, g.liberal)}
        </span>
        <span className="lm fas">
          <Emblem party="fascist" size={20} />
          {pips(6, g.fascist)}
        </span>
        <span className="lm trk">
          {t.tracker} {pips(3, g.tracker)}
        </span>
        <span aria-hidden="true">{open ? "−" : "＋"}</span>
      </button>
      <div className="ledger-full">
      <div className="policy-track liberal">
        <div className="track-title">
          <Emblem party="liberal" size={30} />
          <span>{t.liberal}</span>
          <b>{g.liberal}/5</b>
        </div>
        <div className="track-slots">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={i < g.liberal ? "enacted" : ""}>
              {i < g.liberal ? (
                <Emblem party="liberal" size={28} />
              ) : (
                <span>{String(i + 1).padStart(2, "0")}</span>
              )}
              <small>{i === 4 ? t.victory : ""}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="policy-track fascist">
        <div className="track-title">
          <Emblem party="fascist" size={30} />
          <span>{t.fascist}</span>
          <b>{g.fascist}/6</b>
        </div>
        <div className="track-slots">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={i < g.fascist ? "enacted" : ""}>
              {i < g.fascist ? (
                <Emblem party="fascist" size={28} />
              ) : (
                <span>{String(i + 1).padStart(2, "0")}</span>
              )}
              <small>
                {i === 5 ? t.victory : short(powers[i])}
                {i === 4 && ` · ${t.vetoShort}`}
              </small>
            </div>
          ))}
        </div>
      </div>
      <div className="board-meta">
        <span
          className="tracker-gauge"
          role="img"
          aria-label={`${t.tracker} ${g.tracker}/3`}
        >
          {t.tracker}
          {[1, 2, 3].map((n) => (
            <i key={n} className={g.tracker >= n ? "lit" : ""} />
          ))}
        </span>
        <span>
          {t.deck} <b>{g.deckCount}</b>
        </span>
        <span>
          {t.discardPile} <b>{g.discardCount}</b>
        </span>
        {g.vetoEnabled && <span className="veto-seal">{t.vetoOpen}</span>}
      </div>
      </div>
    </section>
  );
}

/** Long-press signature: deliberate, hard to mis-tap, keyboard accessible. */
function HoldSign({
  label,
  ms,
  danger,
  disabled,
  onDone,
  t,
}: {
  label: string;
  ms: number;
  danger?: boolean;
  disabled?: boolean;
  onDone: () => void;
  t: Copy;
}) {
  const [p, setP] = useState(0),
    raf = useRef(0),
    t0 = useRef(0),
    fired = useRef(false);
  const stop = () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    t0.current = 0;
    setP(0);
  };
  const step = (now: number) => {
    if (!t0.current) t0.current = now;
    const v = Math.min(1, (now - t0.current) / ms);
    setP(v);
    if (v >= 1) {
      if (!fired.current) {
        fired.current = true;
        onDone();
      }
      return;
    }
    raf.current = requestAnimationFrame(step);
  };
  const begin = () => {
    if (disabled || raf.current) return;
    fired.current = false;
    raf.current = requestAnimationFrame(step);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <button
      className={`hold-sign ${danger ? "danger" : "primary"}`}
      style={{ ["--p" as string]: p } as React.CSSProperties}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        begin();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") stop();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="sign-fill" aria-hidden="true" />
      <span className="sign-label">{label}</span>
      <small>{t.holdSign}</small>
    </button>
  );
}

/** Ballot card: slide up to cast. Tap arms it, a second tap casts. */
function BallotCard({
  ja,
  label,
  onCast,
}: {
  ja: boolean;
  label: string;
  onCast: () => void;
}) {
  const [lift, setLift] = useState(0),
    [armed, setArmed] = useState(false),
    y0 = useRef<number | null>(null),
    moved = useRef(false);
  return (
    <button
      className={`ballot-card ${ja ? "ja" : "nein"} ${armed ? "armed" : ""}`}
      style={{ ["--lift" as string]: `${lift}px` } as React.CSSProperties}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        y0.current = e.clientY;
        moved.current = false;
      }}
      onPointerMove={(e) => {
        if (y0.current === null) return;
        const d = Math.max(0, y0.current - e.clientY);
        if (d > 6) moved.current = true;
        setLift(Math.min(d, 150));
      }}
      onPointerUp={() => {
        if (y0.current === null) return;
        const d = lift,
          wasTap = !moved.current;
        y0.current = null;
        setLift(0);
        if (d >= 70) onCast();
        else if (wasTap) armed ? onCast() : setArmed(true);
      }}
      onPointerCancel={() => {
        y0.current = null;
        setLift(0);
      }}
      onClick={(e) => {
        if (e.detail !== 0) return; // pointer taps are handled above
        armed ? onCast() : setArmed(true);
      }}
      onBlur={() => setArmed(false)}
    >
      <span className="bc-glyph" aria-hidden="true">
        {ja ? <Emblem party="liberal" size={34} /> : <Emblem party="fascist" size={34} />}
      </span>
      <strong>{label}</strong>
    </button>
  );
}

/** S10a: the investigated file opens under the lamp; only the acting president ever renders this. */
function PartyCard({
  g,
  party,
  target,
  t,
}: {
  g: GameView;
  party: "liberal" | "fascist";
  target?: string;
  t: Copy;
}) {
  const p = g.players.find((q) => q.id === target);
  return (
    <div className={`party-card ${party}`}>
      <div className="pc-inner">
        <div className="pc-back">
          <span>{t.topSecret}</span>
        </div>
        <div className="pc-front">
          <div className="pc-photo">
            <Portrait avatar={p?.avatar ?? 0} />
          </div>
          <strong>{p?.name}</strong>
          <Emblem party={party} size={40} />
          <span>
            {t.party}: {t[party]}
          </span>
        </div>
      </div>
    </div>
  );
}
/** S10c: the top three policies fan out for the president and are sealed again afterwards. */
function PeekFan({
  policies,
  t,
}: {
  policies: ("liberal" | "fascist")[];
  t: Copy;
}) {
  return (
    <div className="peek-fan">
      <div className="peek-cards">
        {policies.map((p, i) => (
          <div
            key={i}
            className={`peek-card ${p}`}
            style={
              { "--i": i - (policies.length - 1) / 2 } as React.CSSProperties
            }
          >
            <span className="peek-order">{i + 1}</span>
            <PolicyFace
              policy={p}
              size={32}
              title={p === "liberal" ? t.policyL : t.policyF}
            />
          </div>
        ))}
      </div>
      <small>{t.sealedAfter}</small>
    </div>
  );
}

function Actions({
  room,
  t,
  selected,
  setSelected,
}: {
  room: RoomView;
  t: Copy;
  selected: string;
  setSelected: (id: string) => void;
}) {
  const g = room.game!,
    id = room.selfId,
    alive = g.players.find((p) => p.id === id)?.alive,
    { busy, connected } = useApp();
  const [policyIndex, setPolicyIndex] = useState<number | null>(null);
  useEffect(() => setPolicyIndex(null), [g.phase, g.version]);
  const targetLine = (ids: string[]) => (
    <p className="target-line" aria-live="polite">
      {ids.includes(selected) ? (
        <>
          <span>{t.target}</span>
          <strong>{g.players.find((p) => p.id === selected)?.name}</strong>
        </>
      ) : (
        t.select
      )}
    </p>
  );
  const disabled = busy || !connected || room.paused;
  const activity = <ActivityProgress g={g} selfId={id} paused={room.paused} t={t} />;
  const legislative = g.phase === "president_discard" || g.phase === "chancellor_enact" || g.phase === "veto";
  const progress = legislative ? <LegislationProgress
    key={`${room.code}:${g.round}`}
    phase={g.phase}
    president={g.players.find(p => p.id === g.president)?.name ?? t.president}
    chancellor={g.players.find(p => p.id === g.chancellor)?.name ?? t.chancellor}
    visible={!alive || (g.phase === "veto" ? g.president !== id : !g.hand)}
    paused={room.paused}
    t={t}
  /> : null;
  if (!alive)
    return (
      <div className="action-panel">
        <p>
          {g.players.some((p) => p.id === id) ? t.executed : t.spectatorNote}
        </p>
        {progress}
        {activity}
        {g.phase === "voting" && <GovernmentProposal g={g} t={t} paused={room.paused} />}
      </div>
    );
  return (
    <section
      className="action-panel"
      aria-label={t[g.phase]}
      aria-live="polite"
    >
      <div className="action-heading">
        <span className="eyebrow">{t.protocol}</span>
        <h2>{g.phase === "executive" && g.power ? t[g.power] : t[g.phase]}</h2>
      </div>
      {progress}
      {g.phase === "voting" && <GovernmentProposal g={g} t={t} paused={room.paused} />}
      {activity}
      <fieldset disabled={disabled}>
        {g.phase === "nomination" &&
          (g.president === id ? (
            <>
              <HoldSign
                t={t}
                label={t.nominate}
                ms={600}
                disabled={!g.eligibleChancellors.includes(selected)}
                onDone={() => {
                  act({ type: "nominate", target: selected });
                  setSelected("");
                }}
              />
            </>
          ) : null)}
        {g.phase === "vote_result" && <>
          <button className="primary vote-confirm"
            disabled={g.acknowledged.includes(id)}
            onClick={() => act({ type: "acknowledge" })}>
            {g.acknowledged.includes(id) ? t.resultConfirmed : t.confirmResult}
            {` · ${g.acknowledged.length}/${g.players.filter((p) => p.alive).length}`}
          </button>
          <p className="hint">{t.resultWait}</p>
        </>}
        {g.phase === "voting" &&
          (g.voted.includes(id) ? null : (
            <>
              <div className="ballots">
                <BallotCard
                  ja
                  label={t.ja}
                  onCast={() => act({ type: "vote", ja: true })}
                />
                <BallotCard
                  ja={false}
                  label={t.nein}
                  onCast={() => act({ type: "vote", ja: false })}
                />
              </div>
            </>
          ))}
        {["president_discard", "chancellor_enact", "veto"].includes(g.phase) &&
          (g.hand && g.phase !== "veto" ? (
            <>
              <div className="policy-hand">
                {g.hand.map((p, i) => (
                  <PolicyCard
                    key={`${g.phase}:${g.version}:${i}`}
                    policy={p}
                    index={i}
                    title={p === "liberal" ? t.policyL : t.policyF}
                    action={g.phase === "president_discard" ? t.discard : t.enact}
                    selected={policyIndex === i}
                    disabled={disabled}
                    confirmHint={t.policyConfirmHint}
                    onSelect={() => setPolicyIndex(i)}
                    onClear={() => setPolicyIndex(value => value === i ? null : value)}
                    onConfirm={() =>
                      act(
                        g.phase === "president_discard"
                          ? { type: "discard", index: i }
                          : { type: "enact", index: i },
                      )
                    }
                  />
                ))}
              </div>
              <p className="hint">{t.policyGestureHint}</p>
              {g.phase === "chancellor_enact" &&
                g.vetoEnabled &&
                !g.vetoDenied && (
                  <button onClick={() => act({ type: "request_veto" })}>
                    {t.vetoRequest}
                  </button>
                )}
            </>
          ) : g.phase === "veto" && g.president === id ? (
            <div className="ballots veto-answer">
              <button
                onClick={() => act({ type: "answer_veto", accept: true })}
              >
                {t.vetoAccept}
              </button>
              <button
                onClick={() => act({ type: "answer_veto", accept: false })}
              >
                {t.vetoReject}
              </button>
            </div>
          ) : null)}
        {g.phase === "executive" &&
          (g.president === id ? (
            <>
              {g.privateResult ? (
                <div className="private-result">
                  {g.privateResult.party ? (
                    <PartyCard
                      g={g}
                      party={g.privateResult.party}
                      target={g.privateResult.target}
                      t={t}
                    />
                  ) : (
                    <PeekFan policies={g.privateResult.policies ?? []} t={t} />
                  )}
                  <button
                    className="primary"
                    onClick={() => act({ type: "confirm_power" })}
                  >
                    {t.powerConfirm}
                  </button>
                </div>
              ) : g.power === "peek" ? (
                <button
                  className="primary"
                  onClick={() => act({ type: "power" })}
                >
                  {t.peek}
                </button>
              ) : (
                <>
                  {targetLine(g.eligibleTargets)}
                  <HoldSign
                    t={t}
                    danger={g.power === "execute"}
                    label={g.power ? t[g.power] : ""}
                    ms={g.power === "execute" ? 1000 : 600}
                    disabled={!g.eligibleTargets.includes(selected)}
                    onDone={() => {
                      act({ type: "power", target: selected });
                      setSelected("");
                    }}
                  />
                </>
              )}
            </>
          ) : null)}
      </fieldset>
    </section>
  );
}

function TimeRemaining({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [deadline]);
  if (!deadline) return null;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      className={`timer-hud ${remaining < 10 ? "urgent" : ""}`}
      aria-label="Time remaining"
    >
      ◷ {remaining}s
    </span>
  );
}
function Board({ room, t }: { room: RoomView; t: Copy }) {
  const g = room.game!,
    selected = g.selectedTarget ?? "",
    setSelected = (target: string) => { if (target && target !== selected) act({ type: "select_target", target }); },
    [file, setFile] = useState(false),
    [chatOpen, setChatOpen] = useState(false),
    [tableEl, setTableEl] = useState<HTMLDivElement | null>(null),
    [box, setBox] = useState({ w: 340, h: 380 });
  // seats are placed from the *measured* table box so they never overlap or clip
  useLayoutEffect(() => {
    if (!tableEl) return;
    const measure = () => {
      // floor the fractional flex size so seats can never poke past the real box
      const r = tableEl.getBoundingClientRect();
      setBox({ w: Math.floor(r.width), h: Math.floor(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(tableEl);
    return () => ro.disconnect();
  }, [tableEl]);
  const ring = useMemo(
    () => layoutSeats(box.w, box.h, g.players.length),
    [box.w, box.h, g.players.length],
  );
  if (g.phase === "night")
    return (
      <main className="night content">
        <p className="eyebrow">{t.eyesOnly}</p>
        <h1>{t.night}</h1>
        <SecretFile g={g} selfId={room.selfId} t={t} />
        <ActivityProgress g={g} selfId={room.selfId} paused={room.paused} t={t} />
        <p className="fine-print">
          {g.acknowledged.length} / {g.players.length}
        </p>
      </main>
    );
  return (
    <main className="board content">
      <div className="session-line">
        <p className="eyebrow">
          {t.session} {String(g.round).padStart(2, "0")} {t.sessionEnd}
          <span className="room-code"> / {room.code}</span>
        </p>
        <span className="phase-name">
          {g.phase === "executive" && g.power ? t[g.power] : t[g.phase]}
          {["nomination", "executive", "president_discard", "chancellor_enact", "veto"].includes(g.phase) &&
            ` · ${g.players.find(p => p.id === (g.phase === "chancellor_enact" ? g.chancellor : g.president))?.name ?? ""}`}
        </span>
        <TimeRemaining deadline={room.deadline} />
        <button className="icon-btn" aria-label={t.chat} onClick={() => setChatOpen(true)}>☏</button>
        {g.selfRole && (
          <button
            className="icon-btn"
            aria-label={t.hold}
            onClick={() => setFile(!file)}
          >
            ▤<span className="lbl"> {t.fileOpen}</span>
          </button>
        )}
      </div>
      <Track g={g} t={t} />
      <div className="assembly-layout">
        <section className="assembly">
          <div
            className={`round-table ${g.phase === "vote_result" ? "show-vote-result" : ""}`}
            data-table
            ref={setTableEl}
            style={
              {
                "--ph": `${ring.ph}px`,
                "--sw": `${ring.sw}px`,
                "--sh": `${ring.sh}px`,
              } as React.CSSProperties
            }
          >
            <div className="table-surface" aria-hidden="true" />
            <div className="table-mark" aria-hidden="true">
              <Emblem party="liberal" size={72} />
              <span>
                PARLAMENT
                <br />
                1932
              </span>
            </div>
            {g.phase === "vote_result" && <VoteScene
              key={[...g.events].reverse().find((e) => e.type === "vote")?.id}
              ev={[...g.events].reverse().find((e) => e.type === "vote")!} g={g} t={t}
              reduced={document.body.dataset.reduce === "true"} speed={1} />}
            {g.phase !== "vote_result" && g.players.map((p, i) => {
              const member = room.members.find((m) => m.id === p.id),
                candidate =
                  (g.phase === "nomination" &&
                    g.president === room.selfId &&
                    g.eligibleChancellors.includes(p.id)) ||
                  (g.phase === "executive" &&
                    g.president === room.selfId &&
                    g.eligibleTargets.includes(p.id));
              const selfIdx = Math.max(
                  0,
                  g.players.findIndex((q) => q.id === room.selfId),
                ),
                pos = slotFor(ring, i, selfIdx, g.players.length),
                dx = box.w / 2 - pos.x,
                dy = box.h / 2 - pos.y,
                len = Math.hypot(dx, dy) || 1,
                style = {
                  left: pos.x,
                  top: pos.y,
                  // unit vector toward the table centre (where the ballot card lands)
                  "--vx": dx / len,
                  "--vy": dy / len,
                } as React.CSSProperties;
              const voted = g.phase === "voting" && g.voted.includes(p.id);
              return (
                <button
                  key={p.id}
                  data-seat-id={p.id}
                  style={style}
                  className={`seat ${p.id === g.president ? "president" : ""} ${p.id === g.chancellor ? "chancellor" : ""} ${!p.alive ? "dead" : ""} ${selected === p.id ? "selected" : ""} ${candidate ? "candidate" : ""}`}
                  disabled={!candidate}
                  aria-label={`${p.name}${p.id === g.president ? ` · ${t.president}` : ""}${p.id === g.chancellor ? ` · ${t.chancellor}` : ""}${!p.alive ? ` · ${t.executed}` : ""}`}
                  title={
                    !p.alive
                      ? t.executed
                      : candidate
                        ? t.select
                        : g.phase === "nomination"
                          ? p.id === g.president
                            ? t.ineligibleSelf
                            : p.id === g.previousGovernment?.chancellor
                              ? t.ineligibleChancellor
                              : p.id === g.previousGovernment?.president &&
                                  g.players.filter((q) => q.alive).length > 5
                                ? t.ineligiblePresident
                                : t.wait
                          : g.power === "investigate" && p.investigated
                            ? t.investigated
                            : t.wait
                  }
                  onClick={() => setSelected(p.id)}
                >
                  <div className="seat-photo">
                    <Portrait avatar={p.avatar} />
                    {!p.alive && (
                      <span className="dead-stamp">{t.executed}</span>
                    )}
                  </div>
                  <div className="nameplates">
                    {p.id === g.president && (
                      <span className="office president-office">
                        <svg className="office-emblem" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M7 20C2 17 2 9 6 5M17 20C22 17 22 9 18 5M5 15l-3-2m3-2L3 8m4 0L6 4m13 11 3-2m-3-2 2-3m-4 0 1-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <path d="m12 5 1.8 3.7 4.1.6-3 2.9.7 4.1-3.6-1.9-3.6 1.9.7-4.1-3-2.9 4.1-.6Z" fill="currentColor" />
                        </svg>
                        <span className="office-label">{t.president}</span>
                      </span>
                    )}
                    {p.id === g.chancellor && (
                      <span className="office chancellor-office" data-nominee={g.phase === "voting" ? "true" : undefined}>
                        <svg className="office-emblem" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="m3 8 9-5 9 5ZM4 20h16M6 17h12M7 10v7m5-7v7m5-7v7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="office-label">{g.phase === "voting" ? t.nominee : t.chancellor}</span>
                      </span>
                    )}
                  </div>
                  <strong>
                    {p.name}
                    {p.id === room.selfId && ` · ${t.you}`}
                  </strong>
                  <div className="seat-stamps">
                    {p.alive && (
                      <>
                        {p.investigated && <span>{t.investigated}</span>}
                        {!member?.connected && <span>{t.offline}</span>}
                      </>
                    )}
                  </div>
                  {voted && <span className="vote-down" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <Actions
            room={room}
            t={t}
            selected={selected}
            setSelected={setSelected}
          />
        </section>
      </div>
      {chatOpen && <Modal title={t.chat} close={() => setChatOpen(false)}><Chat room={room} t={t} inline /></Modal>}
      {file && (
        <Modal title={t.topSecret} close={() => setFile(false)}>
          <SecretFile g={g} selfId={room.selfId} t={t} />
        </Modal>
      )}
    </main>
  );
}

function Chat({
  room,
  t,
  inline = false,
}: {
  room: RoomView;
  t: Copy;
  inline?: boolean;
}) {
  const [text, setText] = useState(""),
    [open, setOpen] = useState(inline),
    ref = useRef<HTMLDivElement>(null);
  const g = room.game,
    p = g?.players.find((p) => p.id === room.selfId),
    allowed =
      !g ||
      (!!p?.alive &&
        !(
          ["president_discard", "chancellor_enact", "veto"].includes(g.phase) &&
          (room.selfId === g.president || room.selfId === g.chancellor)
        ));
  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [room.chat.length, open]);
  return (
    <div className={`chat ${open ? "chat-open" : ""} ${inline ? "chat-inline" : ""}`}>
      {!inline && (
        <button
          className="chat-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {t.chat}
          <span>
            {room.chat.length} {open ? "−" : "＋"}
          </span>
        </button>
      )}
      {open && (
        <>
          <div className="messages" ref={ref}>
            {room.chat.map((m) => (
              <p key={m.id}>
                <b>{m.name}</b>
                <span>{m.text}</span>
              </p>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim()) {
                void run("CHAT", { text });
                setText("");
              }
            }}
          >
            <input
              aria-label={t.chat}
              value={text}
              disabled={!allowed}
              placeholder={allowed ? t.message : t.chatLocked}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
            />
            <button disabled={!allowed || !text.trim()}>{t.send}</button>
          </form>
        </>
      )}
    </div>
  );
}
function Results({ room, t }: { room: RoomView; t: Copy }) {
  const g = room.game!;
  const ko = t.confirm === "확인";
  const selfRole = g.revealedRoles?.[room.selfId];
  const selfWon = selfRole && g.winner ? (selfRole === "liberal" ? "liberal" : "fascist") === g.winner : null;
  const winLabel = ko ? "승리" : "Victory";
  const lossLabel = ko ? "패배" : "Defeat";
  return (
    <main className={`results content ${g.winner ?? ""}`}>
      <p className="eyebrow">
        {t.finished} / {room.code}
      </p>
      <Emblem party={g.winner ?? "liberal"} size={90} />
      <h1>
        {g.winner === "liberal"
          ? t.liberalWin
          : g.winner === "fascist"
            ? t.fascistWin
            : t.ended}
      </h1>
      {g.winner && <section className="result-outcome-summary" aria-label={ko ? "최종 승패" : "Final outcome"}>
        {selfWon !== null && <div className={`result-personal ${selfWon ? "won" : "lost"}`}>
          <span>{ko ? "나의 결과" : "YOUR RESULT"}</span>
          <strong>{selfWon ? winLabel : lossLabel}</strong>
        </div>}
        <div className="result-team-summary">
          <span className="winning-team"><i aria-hidden="true">✦</i>{winLabel}<b>{t[g.winner]}</b></span>
          <span className="losing-team"><i aria-hidden="true">×</i>{lossLabel}<b>{t[g.winner === "liberal" ? "fascist" : "liberal"]}</b></span>
        </div>
      </section>}
      <p>
        {g.winner === "liberal"
          ? g.liberal === 5
            ? t.reasonLiberal
            : t.reasonExecution
          : g.winner === "fascist"
            ? g.fascist === 6
              ? t.reasonFascist
              : t.reasonElection
            : t.reasonEnded}
      </p>
      <Track g={g} t={t} full />
      <div className="result-roles">
        {g.players.map((p, i) => {
          const role = g.revealedRoles?.[p.id];
          const team = role ? (role === "liberal" ? "liberal" : "fascist") : null;
          const outcome = g.winner && team ? (team === g.winner ? "winner" : "loser") : "neutral";
          const label = outcome === "winner" ? winLabel : outcome === "loser" ? lossLabel : (ko ? "승부 미결정" : "No result");
          return (
            <article
              key={p.id}
              className={`result-player ${role ? `role-${role}` : ""} ${outcome}`}
              data-player-id={p.id}
              data-outcome={outcome}
              data-self={p.id === room.selfId}
              aria-label={`${p.name}${role ? ` · ${t[role]}` : ""} · ${label}`}
              style={{ ["--i" as string]: i } as React.CSSProperties}
            >
              <span className="result-player-outcome"><span aria-hidden="true">{outcome === "winner" ? "✦" : outcome === "loser" ? "×" : "—"}</span>{label}</span>
              <div className="result-portrait-frame">
                <Portrait avatar={p.avatar} />
                {outcome === "loser" && <svg className="result-defeat-mark" viewBox="0 0 120 150" fill="none" aria-hidden="true">
                  <g className="result-cross" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m24 22 19 24 23 23 31 38M97 23 76 48 52 74 23 107" stroke="#370e13" strokeWidth="15" />
                    <path d="m24 22 19 24 23 23 31 38M97 23 76 48 52 74 23 107" stroke="#b33037" strokeWidth="9" />
                    <path d="m25 22 23 29m24 28 21 23M96 24 75 49 56 70" stroke="#ed7861" strokeWidth="2" opacity=".65" />
                  </g>
                  <g className="result-blood-trails" fill="#9c252e">
                    <path d="M39 48h6l-1 40-2 25-2-25ZM77 88h7l-2 27-2 24-2-24ZM23 102h5l-1 22-2 9-1-9ZM94 104h5l-1 17-2 8-1-8Z" />
                    <ellipse cx="42" cy="115" rx="2.7" ry="4" /><ellipse cx="80" cy="141" rx="3" ry="4.5" />
                    <circle cx="20" cy="35" r="2" /><circle cx="101" cy="42" r="2.4" /><circle cx="31" cy="118" r="1.7" />
                  </g>
                </svg>}
                {outcome === "winner" && <svg className="result-victor-seal" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                  <circle cx="20" cy="20" r="18" fill="#302815" stroke="#d2b878" /><circle cx="20" cy="20" r="15" stroke="#9b7d43" />
                  <path d="m20 10 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z" fill="#e5ca88" />
                </svg>}
              </div>
              <strong>{p.name}</strong>
              <span className="role-line">
                {role && <Emblem party={role} size={20} />}
                {role && t[role]}
              </span>
              <span className="result-player-state">{p.id === room.selfId && `${t.you} · `}{p.alive ? (ko ? "생존" : "Survived") : (ko ? "처형됨" : "Executed")}</span>
            </article>
          );
        })}
      </div>
      <div className="result-actions">
        {room.hostId === room.selfId && (
          <button className="primary" onClick={() => void run("REMATCH")}>
            {t.rematch}
          </button>
        )}
      </div>
    </main>
  );
}

function App() {
  const { room, error, connected, resuming, busy } = useApp();
  const [language, setLanguage] = useState<Language>(
      readLocal("sh-language", "ko") === "en" ? "en" : "ko",
    ),
    [modal, setModal] = useState(""),
    [leaveConfirm, setLeaveConfirm] = useState(false);
  const lang = room?.settings.language ?? language,
    t = copy[lang];
  const [reduce, setReduce] = useState(
      readLocal(
        "sh-reduce",
        matchMedia("(prefers-reduced-motion: reduce)").matches ? "1" : "0",
      ) === "1",
    ),
    [low, setLow] = useState(readLocal("sh-low", "0") === "1");
  const { view, scene, skip } = useScenes(room, reduce);
  // action clock and pause are always the server's truth, even while a scene delays the rest
  const shown = (
    view && room ? { ...view, deadline: room.deadline, paused: room.paused } : (view ?? room)
  ) as RoomView;
  useEffect(() => {
    document.documentElement.lang = lang;
    document.body.dataset.reduce = String(reduce);
    document.body.dataset.low = String(low);
    writeLocal("sh-reduce", reduce ? "1" : "0");
    writeLocal("sh-low", low ? "1" : "0");
  }, [lang, reduce, low]);
  useEffect(() => {
    document.body.dataset.stage = String(
      !!shown?.game && shown.game.phase !== "finished",
    );
  }, [shown?.game?.phase, !!shown?.game]);
  return (
    <>
      <Presentation
        view={view}
        scene={scene}
        skip={skip}
        t={t}
        reduced={reduce}
      />
      <div className="ambient" aria-hidden="true">
        <div className="wall" />
        <div className="lamp-fixture" />
        <div className="vignette" />
      </div>
      <header className="topbar">
        <a
          href={(import.meta as any).env.BASE_URL}
          onClick={(e) => {
            if (room) {
              e.preventDefault();
              setLeaveConfirm(true);
            }
          }}
          className="brand"
        >
          <Emblem party="liberal" size={28} />
          <span>
            SECRET HITLER<small>THE INTERROGATION ROOM</small>
          </span>
        </a>
        <nav>
          {!room && (
            <select
              aria-label={t.language}
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value as Language);
                writeLocal("sh-language", e.target.value);
              }}
            >
              <option value="ko">KO</option>
              <option value="en">EN</option>
            </select>
          )}
          <button aria-label={t.settings} onClick={() => setModal("settings")}>
            ⚙
          </button>
          <button onClick={() => setModal("rules")}>{t.rules}</button>
          {room && (
            <button onClick={() => setLeaveConfirm(true)}>{t.leave} ↗</button>
          )}
        </nav>
      </header>
      {resuming ? (
        <main className="loading">{t.reconnecting}</main>
      ) : !room ? (
        <Home t={t} />
      ) : !shown.game ? (
        <Lobby room={room} t={t} />
      ) : shown.game.phase === "finished" ? (
        <Results room={shown} t={t} />
      ) : (
        <Board room={shown} t={t} />
      )}
      <footer>
        <span>SECRET HITLER / NON-COMMERCIAL FAN ADAPTATION</span>
        <button onClick={() => setModal("credits")}>{t.credits} ↗</button>
      </footer>
      {room && <Chat room={room} t={t} />}
      <div className="sr-only" aria-live="polite">
        {room?.game && t[room.game.phase]}
      </div>
      {!connected && (
        <div className="connection-strip" role="status">
          {room ? t.reconnecting : t.connecting}
          <button onClick={() => socket.connect()}>{t.retry}</button>
        </div>
      )}
      {room?.paused && (
        <div className="pause-overlay">
          <div className="paper">
            <p className="eyebrow">SESSION SUSPENDED</p>
            <h2>{t.paused}</h2>
            <p>{t.pausedBody}</p>
            <p>
              {room.members
                .filter((p) => !p.connected && !p.spectator && !p.bot)
                .map((p) => p.name)
                .join(", ")}
            </p>
            {room.hostId === room.selfId && (
              <div className="pause-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void run("HOST_DECISION", { decision: "wait" })
                  }
                >
                  {t.waitAction}
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run("HOST_DECISION", { decision: "replace" })
                  }
                >
                  {t.replace}
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => void run("HOST_DECISION", { decision: "end" })}
                >
                  {t.end}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "rules"
              ? t.rules
              : modal === "credits"
                ? t.credits
                : t.settings
          }
          close={() => setModal("")}
        >
          {modal === "rules" ? (
            <Rulebook t={t} lang={lang} />
          ) : modal === "credits" ? (
            <div className="credits">
              <Emblem size={64} />
              <h3>시크릿 히틀러 / Secret Hitler</h3>
              <p>
                Goat, Wolf & Cabbage
                <br />
                Max Temkin · Mike Boxleiter
                <br />
                Tommy Maranges · Mac Schubert
              </p>
              <p>
                Original game and this non-commercial adaptation:
                <br />
                <a
                  href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY-NC-SA 4.0
                </a>
              </p>
              <p>
                <a
                  href="https://www.secrethitler.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  secrethitler.com ↗
                </a>
              </p>
              <p>
                Changes: Korean/English digital multiplayer adaptation, server
                rules engine, original interface, vector illustrations and
                synthesized audio. Not affiliated with the original creators.
              </p>
            </div>
          ) : (
            <div className="preferences">
              <label>
                <input
                  type="checkbox"
                  checked={reduce}
                  onChange={(e) => setReduce(e.target.checked)}
                />
                {t.motion}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={low}
                  onChange={(e) => setLow(e.target.checked)}
                />
                {t.quality}
              </label>
            </div>
          )}
        </Modal>
      )}
      {leaveConfirm && (
        <Modal title={t.leave} close={() => setLeaveConfirm(false)}>
          <p>{t.leaveAsk}</p>
          <div className="modal-actions">
            <button onClick={() => setLeaveConfirm(false)}>{t.cancel}</button>
            <button
              onClick={() => {
                void leave();
                setLeaveConfirm(false);
              }}
            >
              {t.confirm}
            </button>
          </div>
        </Modal>
      )}
      {error && (
        <div role="alert" className="toast">
          <span>
            {error.startsWith("@")
              ? ((t[error.slice(1) as keyof Copy] as string | undefined) ?? error)
              : error}
          </span>
          <button
            aria-label="Close"
            onClick={() => useApp.getState().setError(null)}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
connect();
createRoot(document.getElementById("root")!).render(<App />);
if (
  (import.meta as any).env.PROD &&
  !(window as any).Capacitor &&
  "serviceWorker" in navigator
)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/secret_hitler/sw.js");
  });

