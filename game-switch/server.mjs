const limits = { werewolf: [3,10], avalon: [5,10], skullking: [2,9], spacecrew: [3,5], rummikub: [2,4], deception: [4,12], secret_hitler: [5,10] };
// The src and dist directories have the same depth, so this import also works after compilation.
export function registerGameSwitch(io, socket, source) {
  socket.on('GAME_SWITCH_RESERVE', async (data, ack) => {
    try {
      const room = await source();
      if (!room.members.some(p => p.id === room.actorId)) throw Error('유효하지 않은 세션입니다.');
      socket.data.gameSwitchReservationUntil = Date.now() + 120_000;
      await room.reserve?.();
      ack?.({ ok: true, data: {} });
    } catch { ack?.({ ok: false, error: '이동할 자리를 예약하지 못했습니다.' }); }
  });
  let busy = false;
  let completed = false;
  socket.on('GAME_SWITCH', async (data, ack) => {
    if (busy || completed) { ack?.({ ok: false, error: '이미 게임 이동을 처리하고 있습니다.' }); return; }
    busy = true;
    try {
      const room = await source();
      const members = room.members.filter(p => !p.isBot && !p.bot && !p.spectator);
      const actor = members.find(p => p.id === room.actorId);
      if (!actor || actor.id !== room.hostId || (actor.socketId && actor.socketId !== socket.id)) throw Error('방장만 게임을 변경할 수 있습니다.');
      if (!members.length || members.some(p => !p.connected)) throw Error('모든 참가자가 연결된 뒤 게임을 변경해 주세요.');
      const range = Object.hasOwn(limits, data?.game) ? limits[data.game] : null;
      if (!range || members.length < range[0] || members.length > range[1]) throw Error('현재 인원으로 이동할 수 없는 게임입니다.');
      const nameLimit = ['deception', 'secret_hitler'].includes(data.game) ? 20 : 16;
      if (members.some(p => (p.nickname ?? p.name ?? '').length > nameLimit)) throw Error(`대상 게임은 닉네임을 ${nameLimit}자까지 지원합니다. 참가자 이름을 확인해 주세요.`);
      if (!data.sessions) {
        ack?.({ ok: true, data: { members: members.map(p => ({ id: p.id, name: p.nickname ?? p.name })), hostId: room.hostId } });
        return;
      }
      const code = String(data.code ?? '');
      if (!/^[A-Z0-9]{4,6}$/.test(code) || typeof data.sessions !== 'object') throw Error('이동할 방 정보가 올바르지 않습니다.');
      const fields = data.game === 'secret_hitler' ? ['code','id','token'] : data.game === 'deception' ? ['code','playerId','token'] : data.game === 'spacecrew' ? ['code','playerId','sessionToken'] : data.game === 'rummikub' ? ['roomId','playerId','sessionToken'] : ['roomCode','playerId','sessionToken'];
      for (const p of members) {
        const session = data.sessions[p.id];
        if (!session || fields.some(k => typeof session[k] !== 'string' || !session[k] || session[k].length > 200) || session[fields[0]] !== code) throw Error('참가자가 변경되었습니다. 다시 시도해 주세요.');
      }
      // Credentials are delivered only to the authenticated participant's socket.
      const deliveries = members.map(p => {
        const session = Object.fromEntries(fields.map(k => [k, data.sessions[p.id][k]]));
        const destination = p.socketId ?? [...io.sockets.sockets.values()].find(s => (s.data.id ?? s.data.playerId ?? s.data.player) === p.id)?.id;
        if (!destination) throw Error('참가자의 연결을 확인해 주세요.');
        return { destination, session, name: p.nickname ?? p.name };
      });
      for (const delivery of deliveries) io.to(delivery.destination).emit('GAME_SWITCHED', { game: data.game, session: delivery.session, name: delivery.name });
      completed = true;
      ack?.({ ok: true, data: {} });
    } catch (error) { ack?.({ ok: false, error: error instanceof Error ? error.message : '게임을 변경하지 못했습니다.' }); }
    finally { busy = false; }
  });
}
