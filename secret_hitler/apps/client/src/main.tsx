import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  GameView,
  RoomView,
  Action,
  PublicEvent,
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
import { Portrait, Emblem, ARCHETYPES } from "./Art";
import { Presentation } from "./Presentation";
import "./styles.css";

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
  const [introSkipped, setIntroSkipped] = useState(false);
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
            REIC H S T A G<br />
            ARCHIV / 1932
          </span>
          <Emblem party="fascist" size={150} />
          <b>STRENG GEHEIM</b>
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
        <h1>
          SECRET
          <br />
          <span>HITLER</span>
        </h1>
        <p className="korean-title">{t.title}</p>
        <p className="subtitle">{t.sub}</p>
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
  const [copied, setCopied] = useState(false);
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
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  invitationUrl(room.code),
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
              } catch {
                useApp.getState().setError(`${t.code}: ${room.code}`);
              }
            }}
          >
            {copied ? t.copied : t.invite} ↗
          </button>
        </div>
      </div>
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
        className={`hold-file ${open ? "opened" : ""}`}
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
          {open ? "DECLASSIFIED" : "STRENG GEHEIM"}
        </span>
        {open ? (
          <>
            <Emblem party={g.selfRole} size={70} />
            <h2>
              {t[g.selfRole]}
              {g.selfRole === "hitler" && " / HITLER"}
            </h2>
            <p>{g.knownPlayers.length ? t.allies : t.noAllies}</p>
            {g.knownPlayers.map((p) => (
              <div key={p.id}>
                {g.players.find((q) => q.id === p.id)?.name} · {t[p.role]}
              </div>
            ))}
          </>
        ) : (
          <>
            <span className="sealed-mark">▤</span>
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
function Track({ g, t }: { g: GameView; t: Copy }) {
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
  return (
    <section className="policy-board" aria-label="Policy tracks">
      <div className="policy-track liberal">
        <div className="track-title">
          <Emblem party="liberal" />
          <span>
            {t.liberal}
            <small>LIBERAL POLICIES</small>
          </span>
          <b>{g.liberal}/5</b>
        </div>
        <div className="track-slots">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={i < g.liberal ? "enacted" : ""}>
              <span>
                {i < g.liberal ? "❧" : String(i + 1).padStart(2, "0")}
              </span>
              <small>{i === 4 ? "VICTORY" : "POLICY"}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="policy-track fascist">
        <div className="track-title">
          <Emblem party="fascist" />
          <span>
            {t.fascist}
            <small>FASCIST POLICIES</small>
          </span>
          <b>{g.fascist}/6</b>
        </div>
        <div className="track-slots">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={i < g.fascist ? "enacted" : ""}>
              <span>
                {i < g.fascist ? "⚒" : String(i + 1).padStart(2, "0")}
              </span>
              <small>
                {powers[i] ? t[powers[i] as "peek"] : i === 5 ? "VICTORY" : "—"}
              </small>
              {i === 4 && <em>VETO</em>}
            </div>
          ))}
        </div>
      </div>
      <div className="board-meta">
        <span>
          {t.tracker} <i className={g.tracker >= 1 ? "lit" : ""} />
          <i className={g.tracker >= 2 ? "lit" : ""} />
          <i /> <b>{g.tracker}/3</b>
        </span>
        <span>
          {t.deck} <b>{g.deckCount}</b> / {t.discardPile}{" "}
          <b>{g.discardCount}</b>
        </span>
        {g.vetoEnabled && <span className="veto-seal">{t.vetoOpen}</span>}
      </div>
    </section>
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
  const [confirm, setConfirm] = useState<Action | null>(null);
  const targetSelect = (ids: string[]) => (
    <>
      <label>
        {t.select}
        <select
          aria-label={t.select}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">—</option>
          {ids.map((pid) => (
            <option value={pid} key={pid}>
              {g.players.find((p) => p.id === pid)?.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
  const disabled = busy || !connected || room.paused;
  if (!alive)
    return (
      <div className="action-panel">
        <p>
          {g.players.some((p) => p.id === id) ? t.executed : t.spectatorNote}
        </p>
      </div>
    );
  return (
    <section
      className="action-panel"
      aria-label={t[g.phase]}
      aria-live="polite"
    >
      <div className="action-heading">
        <span className="eyebrow">CURRENT PROCEDURE</span>
        <h2>{t[g.phase]}</h2>
      </div>
      <fieldset disabled={disabled}>
        {g.phase === "nomination" &&
          (g.president === id ? (
            <>
              {targetSelect(g.eligibleChancellors)}
              <button
                className="primary"
                disabled={!g.eligibleChancellors.includes(selected)}
                onClick={() => act({ type: "nominate", target: selected })}
              >
                {t.nominate}
              </button>
            </>
          ) : (
            <p>{t.wait}</p>
          ))}
        {g.phase === "voting" &&
          (g.voted.includes(id) ? (
            <p className="sealed-vote">
              ✓ {t.voted} {g.voted.length}/
              {g.players.filter((p) => p.alive).length}
            </p>
          ) : (
            <div className="ballots">
              <button
                className="ja"
                onClick={() => act({ type: "vote", ja: true })}
              >
                {t.ja}
              </button>
              <button
                className="nein"
                onClick={() => act({ type: "vote", ja: false })}
              >
                {t.nein}
              </button>
            </div>
          ))}
        {["president_discard", "chancellor_enact", "veto"].includes(g.phase) &&
          (g.hand && g.phase !== "veto" ? (
            <>
              <div className="policy-hand">
                {g.hand.map((p, i) => (
                  <button
                    key={i}
                    className={`policy-card ${p}`}
                    onClick={() =>
                      act(
                        g.phase === "president_discard"
                          ? { type: "discard", index: i }
                          : { type: "enact", index: i },
                      )
                    }
                  >
                    <Emblem party={p} size={54} />
                    <strong>{p === "liberal" ? t.policyL : t.policyF}</strong>
                    <small>
                      {g.phase === "president_discard" ? t.discard : t.enact}
                    </small>
                  </button>
                ))}
              </div>
              {g.phase === "chancellor_enact" &&
                g.vetoEnabled &&
                !g.vetoDenied && (
                  <button onClick={() => act({ type: "request_veto" })}>
                    {t.vetoRequest}
                  </button>
                )}
            </>
          ) : g.phase === "veto" && g.president === id ? (
            <div className="ballots">
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
          ) : (
            <div className="locked-door">
              <span>▥</span>
              <p>{t.locked}</p>
              <small>{t.wait}</small>
            </div>
          ))}
        {g.phase === "executive" &&
          (g.president === id ? (
            <>
              <h3>{g.power && t[g.power]}</h3>
              {g.privateResult ? (
                <div className="private-result">
                  {g.privateResult.party ? (
                    <>
                      <Emblem party={g.privateResult.party} />
                      <strong>
                        {
                          g.players.find(
                            (p) => p.id === g.privateResult?.target,
                          )?.name
                        }{" "}
                        · {t.party}: {t[g.privateResult.party]}
                      </strong>
                    </>
                  ) : (
                    <div className="peek-policies">
                      {g.privateResult.policies?.map((p, i) => (
                        <span key={i} className={p}>
                          {i + 1}. {p === "liberal" ? t.policyL : t.policyF}
                        </span>
                      ))}
                    </div>
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
                  {targetSelect(g.eligibleTargets)}
                  <button
                    className={g.power === "execute" ? "danger" : "primary"}
                    disabled={!g.eligibleTargets.includes(selected)}
                    onClick={() =>
                      g.power === "execute"
                        ? setConfirm({ type: "power", target: selected })
                        : act({ type: "power", target: selected })
                    }
                  >
                    {g.power && t[g.power]}
                  </button>
                </>
              )}
            </>
          ) : (
            <p>{t.wait}</p>
          ))}
      </fieldset>
      {confirm && (
        <Modal title={t.execute} close={() => setConfirm(null)}>
          <p>{t.executeAsk}</p>
          <p>
            <strong>{g.players.find((p) => p.id === selected)?.name}</strong>
          </p>
          <div className="modal-actions">
            <button onClick={() => setConfirm(null)}>{t.cancel}</button>
            <button
              className="danger"
              onClick={() => {
                act(confirm);
                setConfirm(null);
              }}
            >
              {t.confirm}
            </button>
          </div>
        </Modal>
      )}
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
    [selected, setSelected] = useState(""),
    [file, setFile] = useState(false);
  useEffect(() => {
    setSelected("");
  }, [g.phase, g.round]);
  if (g.phase === "night")
    return (
      <main className="night content">
        <p className="eyebrow">CLASSIFIED / EYES ONLY</p>
        <h1>{t.night}</h1>
        <SecretFile g={g} selfId={room.selfId} t={t} />
        <p className="fine-print">
          {g.acknowledged.length} / {g.players.length}
        </p>
      </main>
    );
  return (
    <main className="board content">
      <div className="session-line">
        <p className="eyebrow">
          {t.session} {String(g.round).padStart(2, "0")} {t.sessionEnd} /{" "}
          {room.code}
        </p>
        <span>{t[g.phase]}</span>
        <TimeRemaining deadline={room.deadline} />
        {g.selfRole && (
          <button onClick={() => setFile(!file)}>▤ {t.hold}</button>
        )}
      </div>
      <Track g={g} t={t} />
      <div className="assembly-layout">
        <section className="assembly">
          <div className="round-table">
            <div className="table-mark">
              <Emblem party="liberal" size={90} />
              <span>
                PARLAMENT
                <br />
                1932
              </span>
            </div>
            {g.players.map((p, i) => {
              const member = room.members.find((m) => m.id === p.id),
                candidate =
                  (g.phase === "nomination" &&
                    g.president === room.selfId &&
                    g.eligibleChancellors.includes(p.id)) ||
                  (g.phase === "executive" &&
                    g.president === room.selfId &&
                    g.eligibleTargets.includes(p.id));
              const angle = (i / g.players.length) * 2 * Math.PI - Math.PI / 2,
                style = {
                  "--seat-x": `${50 + 42 * Math.cos(angle)}%`,
                  "--seat-y": `${50 + 39 * Math.sin(angle)}%`,
                } as React.CSSProperties;
              return (
                <button
                  key={p.id}
                  style={style}
                  className={`seat ${p.id === g.president ? "president" : ""} ${!p.alive ? "dead" : ""} ${selected === p.id ? "selected" : ""}`}
                  disabled={!candidate}
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
                    {p.id === g.president && (
                      <span className="office president-office">
                        {t.president}
                      </span>
                    )}
                    {p.id === g.chancellor && (
                      <span className="office chancellor-office">
                        {g.phase === "voting" ? t.nominee : t.chancellor}
                      </span>
                    )}
                  </div>
                  <strong>
                    {p.name}
                    {p.id === room.selfId && " · YOU"}
                  </strong>
                  <div className="seat-stamps">
                    {!p.alive ? (
                      <span>{t.executed}</span>
                    ) : (
                      <>
                        {p.investigated && <span>{t.investigated}</span>}
                        {p.notHitler && <span>{t.notHitler}</span>}
                        {!member?.connected && <span>{t.offline}</span>}
                        {g.phase === "voting" && g.voted.includes(p.id) && (
                          <span>✓</span>
                        )}
                      </>
                    )}
                  </div>
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
        <aside className="records">
          <Log g={g} t={t} />
        </aside>
      </div>
      {file && (
        <Modal title="CLASSIFIED" close={() => setFile(false)}>
          <SecretFile g={g} selfId={room.selfId} t={t} />
        </Modal>
      )}
    </main>
  );
}
function eventLabel(e: PublicEvent, t: Copy) {
  const labels: Record<string, string> = {
    start: t.night,
    night_end: t.nomination,
    nomination: t.nomination,
    policy: t.enact,
    chaos: "CHAOS",
    shuffle: t.deck,
    executive: t.executive,
    investigation: t.investigate,
    special_election: t.special_election,
    execution: t.executed,
    veto_request: t.vetoRequest,
    veto_answer: t.veto,
    victory: t.finished,
  };
  return labels[e.type] ?? (t === copy.ko ? e.text : e.type);
}
function Log({ g, t }: { g: GameView; t: Copy }) {
  return (
    <section className="log">
      <h2>
        <span>☷</span> {t.log}
        <small>PROTOKOLL</small>
      </h2>
      <div className="log-entries">
        {[...g.events].reverse().map((e) => (
          <article key={e.id} className={e.policy ?? e.type}>
            <span className="log-index">{String(e.id).padStart(3, "0")}</span>
            <div>
              <strong>
                {e.type === "vote"
                  ? Object.values(e.votes ?? {}).filter(Boolean).length >
                    Object.keys(e.votes ?? {}).length / 2
                    ? "JA!"
                    : "NEIN!"
                  : eventLabel(e, t)}
              </strong>
              {e.policy && (
                <span>{e.policy === "liberal" ? t.policyL : t.policyF}</span>
              )}
              {e.president && (
                <small>
                  {t.president}:{" "}
                  {g.players.find((p) => p.id === e.president)?.name}
                </small>
              )}
              {e.chancellor && (
                <small>
                  {t.chancellor}:{" "}
                  {g.players.find((p) => p.id === e.chancellor)?.name}
                </small>
              )}
              {e.target && (
                <small>
                  → {g.players.find((p) => p.id === e.target)?.name}
                </small>
              )}
              {e.votes && (
                <div className="vote-record">
                  {Object.entries(e.votes).map(([id, ja]) => (
                    <span key={id} className={ja ? "vote-ja" : "vote-nein"}>
                      {g.players.find((p) => p.id === id)?.name}:{" "}
                      {ja ? "Ja!" : "Nein!"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
function Chat({ room, t }: { room: RoomView; t: Copy }) {
  const [text, setText] = useState(""),
    [open, setOpen] = useState(false),
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
    <div className={`chat ${open ? "chat-open" : ""}`}>
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
  const g = room.game!,
    [replay, setReplay] = useState(false);
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(g, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `secret-hitler-${room.code}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className={`results content ${g.winner ?? ""}`}>
      <p className="eyebrow">FINAL REPORT / {room.code}</p>
      <Emblem party={g.winner ?? "liberal"} size={90} />
      <h1>
        {g.winner === "liberal"
          ? t.liberalWin
          : g.winner === "fascist"
            ? t.fascistWin
            : t.ended}
      </h1>
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
      <Track g={g} t={t} />
      <div className="result-roles">
        {g.players.map((p) => (
          <article key={p.id}>
            <Portrait avatar={p.avatar} />
            <strong>{p.name}</strong>
            <span>{g.revealedRoles && t[g.revealedRoles[p.id]]}</span>
          </article>
        ))}
      </div>
      <div className="result-actions">
        {room.hostId === room.selfId && (
          <button className="primary" onClick={() => void run("REMATCH")}>
            {t.rematch}
          </button>
        )}
        <button onClick={() => setReplay(!replay)}>{t.replay}</button>
        <button onClick={download}>{t.export} ↓</button>
      </div>
      <Log g={g} t={t} />
      {replay && (
        <section className="paper replay">
          <h2>{t.replay}</h2>
          {g.replay?.map((r, i) => (
            <p key={i}>
              <b>
                #{i + 1} / {r.round}
              </b>{" "}
              {g.players.find((p) => p.id === r.actor)?.name} · {r.action.type}{" "}
              {"target" in r.action &&
                g.players.find(
                  (p) => p.id === ("target" in r.action ? r.action.target : ""),
                )?.name}{" "}
              {"ja" in r.action && (r.action.ja ? "Ja!" : "Nein!")}{" "}
              {"index" in r.action && `[${r.action.index + 1}]`}{" "}
              {r.hand.length > 0 && `(${r.hand.map((p) => t[p]).join(", ")})`}
            </p>
          ))}
        </section>
      )}
    </main>
  );
}
function Rulebook({ t, lang }: { t: Copy; lang: Language }) {
  return (
    <div className="rulebook">
      {lang === "ko" ? (
        <>
          <p>
            5~10인이 자유당과 파시스트(히틀러 포함)로 나뉘어 비밀리에
            대결합니다. 발언과 거짓말은 자유입니다.
          </p>
          <h3>승리</h3>
          <p>
            자유당: 자유 정책 5개 또는 히틀러 처형.
            <br />
            파시스트: 파시스트 정책 6개 또는 파시스트 정책 3개 이후 히틀러의
            수상 당선.
          </p>
          <h3>선거와 입법</h3>
          <p>
            대통령 후보가 본인과 임기 제한자를 제외한 생존자를 수상으로
            지명합니다. 전원 비밀 투표 후 동시에 공개하며, 과반 찬성만
            가결됩니다. 직전 당선 수상은 연임 불가이고, 생존 6명 이상이면 직전
            대통령도 수상이 될 수 없습니다.
          </p>
          <p>
            대통령은 정책 3장 중 1장을 폐기합니다. 수상은 받은 2장 중 1장을
            제정합니다. 이때 대통령과 수상은 말하거나 신호를 보낼 수 없습니다.
            버린 정책은 공개하지 않습니다.
          </p>
          <h3>혼란과 거부권</h3>
          <p>
            부결·거부권 승인 시 선거 트래커가 1 증가합니다. 3이 되면 맨 위
            정책을 자동 제정하고 임기 제한을 해제합니다. 혼란 정책은 대통령
            권한을 발동하지 않습니다. 정책이 실제 제정될 때만 트래커가
            초기화됩니다.
          </p>
          <p>
            파시스트 정책 5개부터 수상은 거부권을 요청할 수 있습니다. 대통령이
            승인하면 두 장 모두 버리고 트래커 +1. 거절하면 수상은 반드시 정책
            1장을 제정합니다.
          </p>
          <h3>비밀 정보와 대통령 권한</h3>
          <p>
            5~6인에서는 파시스트와 히틀러가 서로를 압니다. 7인 이상에서는
            파시스트만 동료와 히틀러를 알며 히틀러는 아무도 모릅니다.
          </p>
          <p>
            정체 조사는 정당만 공개합니다. 특별 선거 후에는 발동한 대통령의 다음
            생존자로 복귀합니다. 엿보기는 상위 3장의 순서를 유지합니다. 처형된
            의원은 발언·투표·출마할 수 없고 히틀러 외에는 역할을 공개하지
            않습니다.
          </p>
          <h3>공식 재셔플 시점</h3>
          <p>
            입법 종료 또는 혼란 정책 제정 후 더미가 3장 미만이면 남은 정책과
            버린 더미를 합쳐 재셔플합니다.
          </p>
        </>
      ) : (
        <>
          <p>
            5–10 players receive secret Liberal, Fascist, or Hitler roles.
            Players may discuss freely and lie.
          </p>
          <h3>Victory</h3>
          <p>
            Liberals: enact 5 Liberal Policies or execute Hitler. Fascists:
            enact 6 Fascist Policies or elect Hitler Chancellor after 3 Fascist
            Policies.
          </p>
          <h3>Elections and legislation</h3>
          <p>
            The rotating President nominates an eligible living Chancellor. A
            strict majority of all living players must vote Ja; ties fail. The
            last elected Chancellor is term limited. With more than 5 survivors,
            the last elected President is also ineligible for Chancellor.
          </p>
          <p>
            The President draws 3 policies and discards 1. The Chancellor enacts
            1 of the remaining 2. These officials cannot communicate during
            legislation. Discards stay secret.
          </p>
          <h3>Chaos and veto</h3>
          <p>
            A failed election or approved veto advances the tracker. At 3, enact
            the top policy, ignore its executive power, clear term limits, and
            reset the tracker. Any enacted policy resets the tracker. After 5
            Fascist Policies the Chancellor may request a veto; the President
            must consent, otherwise a policy must be enacted.
          </p>
          <h3>Information and powers</h3>
          <p>
            In 5–6 players, Hitler and the Fascist know each other. In 7–10,
            Fascists know allies and Hitler, but Hitler knows no allies.
            Investigations show party membership only. A special election
            returns the rotation to the living player after the President who
            called it. Policy Peek preserves order. Executed players cannot
            speak, vote, or hold office; only Hitler is revealed on execution.
          </p>
          <h3>Official reshuffle</h3>
          <p>
            After a legislative session or chaos enactment, reshuffle the
            remaining deck with discards if fewer than 3 policies remain.
          </p>
        </>
      )}
      <table>
        <caption>{t.executive}</caption>
        <thead>
          <tr>
            <th>F #</th>
            <th>5–6</th>
            <th>7–8</th>
            <th>9–10</th>
          </tr>
        </thead>
        <tbody>
          {[
            [1, "—", "—", t.investigate],
            [2, "—", t.investigate, t.investigate],
            [3, t.peek, t.special_election, t.special_election],
            [4, t.execute, t.execute, t.execute],
            [5, t.execute, t.execute, t.execute],
            [6, "VICTORY", "VICTORY", "VICTORY"],
          ].map((row) => (
            <tr key={row[0]}>
              {row.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fine-print">{t.timerNote}</p>
    </div>
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
  useEffect(() => {
    document.documentElement.lang = lang;
    document.body.dataset.reduce = String(reduce);
    document.body.dataset.low = String(low);
    writeLocal("sh-reduce", reduce ? "1" : "0");
    writeLocal("sh-low", low ? "1" : "0");
  }, [lang, reduce, low]);
  return (
    <>
      <Presentation room={room} t={t} reduced={reduce} />
      <div className="ambient" aria-hidden="true">
        <div className="ceiling-light" />
        <div className="light-cone" />
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
      ) : !room.game ? (
        <Lobby room={room} t={t} />
      ) : room.game.phase === "finished" ? (
        <Results room={room} t={t} />
      ) : (
        <Board room={room} t={t} />
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
          <span>{error}</span>
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
