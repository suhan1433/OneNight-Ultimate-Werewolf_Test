import React from "react";
interface Props {
  code: string;
  copied: boolean;
  busy: boolean;
  connected: boolean;
  invite: () => void;
}
export function WaitingRoom({ code, copied, busy, connected, invite }: Props) {
  return (
    <section className="waiting">
      <div className="waiting-stones" aria-hidden="true">
        <i className="stone black" />
        <i className="stone white" />
        <span />
      </div>
      <div className="eyebrow">친구와 두기</div>
      <h1>상대를 기다려요</h1>
      <p>
        방 코드 또는 초대 링크를 보내 주세요.
        <br />
        상대가 입장하면 바로 시작합니다.
      </p>
      <div className="room-code">{code}</div>
      <button className="primary" onClick={invite}>
        {copied ? "초대 링크 복사 완료" : "초대 링크 복사"}
      </button>
    </section>
  );
}
