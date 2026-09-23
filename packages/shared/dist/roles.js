const villageWin = '늑대가 있다면 늑대가 처형되거나, 늑대가 없다면 아무도 처형되지 않아야 합니다.';
const wolfWin = '늑대인간이 한 명도 처형되지 않으면 승리합니다.';
const role = (id, name, emoji, faction, nightOrder, nightAction, description, winCondition = villageWin, maxCount = 1) => ({ id, name, emoji, faction, nightOrder, nightAction, description, winCondition, canActAtNight: nightOrder !== null, maxCount });
export const ROLE_DEFINITIONS = {
    shield_bearer: role('shield_bearer', '방패병', '🛡️', 'village', 1, 'protect', '한 명을 보호합니다.'),
    doppelganger: role('doppelganger', '도플갱어', '🪞', 'village', 2, 'inspect_player', '한 명의 역할을 복사하고 그 능력을 즉시 사용합니다.', '복사한 역할의 승리 조건을 따릅니다.'),
    werewolf: role('werewolf', '늑대인간', '🐺', 'werewolf', 3, 'confirm', '다른 늑대를 확인하며 혼자라면 센터 카드 한 장을 봅니다.', wolfWin, 3),
    alpha_wolf: role('alpha_wolf', '대장 늑대', '🐺👑', 'werewolf', 4, 'swap_player', '늑대가 아닌 한 명의 카드를 늑대 카드로 바꿉니다.', wolfWin),
    mystic_wolf: role('mystic_wolf', '신비한 늑대', '🐺🔮', 'werewolf', 5, 'inspect_player', '다른 한 명의 역할을 확인합니다.', wolfWin),
    dream_wolf: role('dream_wolf', '잠자는 늑대', '🐺💤', 'werewolf', null, 'none', '밤에 깨지 않는 늑대입니다.', wolfWin),
    minion: role('minion', '하수인', '🦴', 'minion', 6, 'confirm', '늑대가 누구인지 확인합니다.', '늑대가 있으면 늑대와 함께, 없다면 누군가 죽고 자신이 살아남으면 승리합니다.'),
    apprentice_tanner: role('apprentice_tanner', '견습 무두장이', '🎓', 'village', 7, 'confirm', '무두장이가 누구인지 확인합니다.', '무두장이가 처형되면 승리하며, 없다면 자신이 처형되어야 합니다.'),
    mason: role('mason', '프리메이슨', '🗿', 'village', 8, 'confirm', '다른 프리메이슨과 서로를 확인합니다.', villageWin, 2),
    seer: role('seer', '예언자', '🔮', 'village', 9, 'inspect_player', '플레이어 한 명 또는 센터 카드 두 장을 확인합니다.'),
    apprentice_seer: role('apprentice_seer', '견습 예언자', '👓', 'village', 10, 'inspect_center', '센터 카드 한 장을 확인합니다.'),
    robber: role('robber', '도둑', '🗡️', 'village', 11, 'swap_player', '다른 한 명과 카드를 바꾸고 새 카드를 확인합니다.'),
    witch: role('witch', '마법사', '🧪', 'village', 12, 'swap_center', '센터 카드와 한 플레이어의 카드를 교환합니다.'),
    troublemaker: role('troublemaker', '말썽쟁이', '🎭', 'village', 13, 'swap_players', '다른 두 명의 카드를 교환합니다.'),
    drunk: role('drunk', '주정뱅이', '🍺', 'village', 14, 'swap_center', '자신의 카드와 센터 카드 한 장을 교환합니다.'),
    insomniac: role('insomniac', '불면증 환자', '😴', 'village', 15, 'confirm', '밤이 끝날 때 자신의 현재 역할을 확인합니다.'),
    journalist: role('journalist', '신문기자', '📰', 'village', 16, 'inspect_player', '한 명을 보고 마을 진영이면 이를 공개합니다.'),
    villager: role('villager', '마을사람', '👤', 'village', null, 'none', '밤 능력이 없는 마을 사람입니다.', villageWin, 3),
    hunter: role('hunter', '사냥꾼', '🏹', 'village', null, 'none', '처형되면 자신이 투표한 사람도 함께 죽습니다.'),
    bodyguard: role('bodyguard', '보디가드', '💂', 'village', null, 'none', '자신이 투표한 대상의 득표를 0으로 만듭니다.'),
    prince: role('prince', '왕자', '🤴', 'village', null, 'none', '자신에게 들어온 표는 0표가 됩니다.'),
    cursed: role('cursed', '저주받은 자', '☠️', 'village', null, 'none', '늑대에게 표를 받으면 늑대로 변합니다.', '변신 전에는 마을, 변신 후에는 늑대 승리 조건을 따릅니다.'),
    tanner: role('tanner', '무두장이', '🥃', 'tanner', null, 'none', '자신이 처형되기를 원하는 독립 역할입니다.', '자신이 처형되면 승리합니다.')
};
export const ROLE_LIST = Object.values(ROLE_DEFINITIONS);
export const NIGHT_ROLES = ROLE_LIST.filter((r) => r.nightOrder !== null).sort((a, b) => a.nightOrder - b.nightOrder);
export const WOLF_ROLES = ['werewolf', 'alpha_wolf', 'mystic_wolf', 'dream_wolf'];
export const PRESETS = {
    beginner: ['werewolf', 'werewolf', 'seer', 'robber', 'villager', 'villager', 'villager', 'tanner'],
    deduction: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'insomniac', 'villager', 'villager'],
    wolfpack: ['werewolf', 'werewolf', 'alpha_wolf', 'mystic_wolf', 'minion', 'seer', 'villager', 'villager'],
    chaos: ['werewolf', 'mystic_wolf', 'doppelganger', 'witch', 'troublemaker', 'drunk', 'tanner', 'villager'],
    recommended: ['werewolf', 'werewolf', 'minion', 'seer', 'robber', 'troublemaker', 'drunk', 'villager']
};
