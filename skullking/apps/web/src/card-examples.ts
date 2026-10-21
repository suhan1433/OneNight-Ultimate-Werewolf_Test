/** Help examples follow the local engine; they never change the live game. */
export type ExamplePlay = { art: string; name: string; player: number; declaration?: string };
export type Example = {
  label: string; plays: ExamplePlay[]; effect: string; result: string;
  winner?: number; removed?: number[]; destroy?: boolean; after?: string[];
};
export type CardLesson = { rule: string; note?: string; examples: Example[] };
const p = (art: string, name: string, player: number, declaration?: string): ExamplePlay => ({ art, name, player, declaration });
const green9 = p('parrot-9', '앵무새 9', 0);
const black5 = p('jolly-5', '졸리 로저 5', 1);
const escape = (player: number) => p('escape', '탈출', player);
const pirate = (player: number) => p('pirate-rosie', '해적 Rosie', player);
const lesson = (rule: string, example: Example, note?: string): CardLesson => ({ rule, examples: [example], note });

export const cardLessons: Record<string, CardLesson> = {
  kraken: {
    rule: '크라켄은 트릭 전체를 파괴합니다. 아무도 트릭을 얻지 못하고, 크라켄이 없었다면 이겼을 사람이 다음 리더가 됩니다.',
    note: '모두 카드를 낼 때까지 기다린 뒤 판정합니다. 괴물이 여러 장이면 마지막 괴물의 효과가 적용되며, Davy Jones가 있으면 괴물들은 제거됩니다.',
    examples: [{ label: '트릭 파괴', plays: [green9, pirate(1), p('kraken', '크라켄', 2)], removed: [0, 1, 2], destroy: true,
      effect: '크라켄 등장! 숫자 카드와 해적을 포함해 트릭 전체가 소용돌이 속으로 사라집니다.',
      result: 'A·B·C 모두 획득 트릭 +0. 크라켄이 없었다면 해적으로 이겼을 B가 다음 리더입니다.', after: ['A +0트릭', 'B +0트릭 · 다음 리더', 'C +0트릭'] }],
  },
  'white-whale': {
    rule: '흰 고래는 특수 카드를 제거하고 수트와 트럼프를 무시합니다. 가장 높은 숫자가 이기며, 같은 숫자라면 먼저 낸 카드가 이깁니다.',
    note: '숫자 카드가 하나도 없으면 아무도 트릭을 얻지 못하고, 이 게임에서는 흰 고래를 낸 사람이 다음 리더가 됩니다.',
    examples: [
      { label: '검정보다 높은 숫자', plays: [green9, black5, p('white-whale', '흰 고래', 2)], removed: [2], winner: 0, effect: '고래가 수트의 힘을 지웁니다. 검정 5도 트럼프가 아닌 숫자 5로 비교합니다.', result: '9 > 5이므로 A가 트릭을 가져가고 다음 리더가 됩니다.' },
      { label: '스컬킹도 제거', plays: [p('skull-king', '스컬킹', 0), p('map-7', '지도 7', 1), p('white-whale', '흰 고래', 2)], removed: [0, 2], winner: 1, effect: '스컬킹을 포함한 특수 카드는 제거됩니다. 숫자 카드인 지도 7만 남습니다.', result: 'B가 트릭을 가져갑니다. 스컬킹의 포획 보너스는 없습니다.' },
      { label: '숫자가 없다면', plays: [pirate(0), p('white-whale', '흰 고래', 1), p('mermaid-alyra', '인어', 2)], removed: [0, 1, 2], destroy: true, effect: '모두 특수 카드입니다. 고래가 제거한 뒤 비교할 숫자가 없습니다.', result: '트릭을 버립니다. 획득 트릭은 모두 +0, 흰 고래를 낸 B가 다음 리더입니다.' },
    ],
  },
  'spotted-stingray': lesson('가오리는 특수 카드를 제거하고, 수트와 상관없이 가장 낮은 숫자 카드가 이기게 합니다.', {
    label: '가장 낮은 숫자 승리', plays: [green9, black5, p('spotted-stingray', '가오리', 2)], removed: [2], winner: 1,
    effect: '검정의 트럼프 효과가 사라집니다. 이번에는 가장 낮은 숫자를 찾습니다.', result: '5 < 9이므로 B가 트릭을 가져갑니다.',
  }, '같은 숫자라면 먼저 낸 카드가 이깁니다. 숫자가 없으면 트릭을 버리고 처음 낸 사람이 다음 리더가 됩니다.'),
  'davy-jones': lesson('데비 존스는 순서와 상관없이 크라켄·흰 고래·가오리와 자신을 제거합니다. 남은 카드로 승자를 정합니다.', {
    label: '크라켄을 없애기', plays: [green9, p('kraken', '크라켄', 1), p('davy-jones', '데비 존스', 2)], removed: [1, 2], winner: 0,
    effect: '데비 존스가 크라켄과 함께 사라집니다. 크라켄의 트릭 파괴는 일어나지 않습니다.', result: '남은 앵무새 9로 A가 승리합니다. C는 괴물 1장 제거 보너스 +20점을 적립합니다.', after: ['A +1트릭', 'B +0트릭', 'C 보너스 +20 적립'],
  }, '제거한 다른 괴물마다 +20점입니다. 보너스는 예측을 맞힌 라운드에만 받으며, 남은 승리 카드가 없으면 트릭을 버립니다.'),
  escape: {
    rule: '탈출은 숫자 카드와 해적 같은 승리 카드에 집니다. 모두 탈출 계열 카드라면 가장 먼저 낸 카드가 이깁니다.',
    examples: [
      { label: '트릭 피하기', plays: [escape(0), p('map-7', '지도 7', 1), escape(2)], winner: 1, effect: 'A의 탈출은 리드 수트를 정하지 않습니다. B의 지도 7이 리드 수트를 정합니다.', result: 'B가 승리합니다. A와 C는 트릭을 얻지 않습니다.' },
      { label: '모두 탈출이라면', plays: [escape(0), p('loot', '약탈', 1), p('tigress', '티그리스', 2, '탈출 선언')], winner: 0, effect: '세 장 모두 탈출로 취급합니다. 이때는 가장 먼저 낸 카드가 이깁니다.', result: 'A가 트릭을 가져갑니다. 탈출 카드로도 트릭을 얻을 수 있습니다.' },
    ],
  },
  tigress: {
    rule: '티그리스는 낼 때 해적 또는 탈출 중 하나를 선언합니다. 선언한 쪽의 서열과 포획 보너스를 적용합니다.',
    examples: [
      { label: '해적으로 선언', plays: [green9, p('tigress', '티그리스', 1, '해적 선언'), p('mermaid-alyra', '인어', 2)], winner: 1, effect: '티그리스가 해적으로 싸웁니다. 숫자와 인어를 이깁니다.', result: 'B가 트릭을 가져가고 인어 포획 보너스 +20점을 적립합니다. 티그리스 자체의 해적 능력은 없습니다.' },
      { label: '탈출로 선언', plays: [green9, p('tigress', '티그리스', 1, '탈출 선언'), p('skull-king', '스컬킹', 2)], winner: 2, effect: '티그리스는 탈출로 처리됩니다. 스컬킹이 잡아도 해적 포획으로 세지 않습니다.', result: 'C가 승리합니다. 티그리스에 대한 +30점 보너스는 없습니다.' },
    ],
  },
  loot: lesson('약탈은 탈출처럼 약한 카드입니다. 다른 사람이 가져가면 약탈을 낸 사람과 승자 사이에 동맹이 생깁니다.', {
    label: '동맹과 라운드 정산', plays: [p('loot', '약탈', 0), p('map-7', '지도 7', 1), escape(2)], winner: 1,
    effect: 'B가 A의 약탈을 가져갑니다. A와 B가 동맹이 됩니다.', result: '라운드 종료 예시: A는 0 예측·0 획득, B는 1 예측·1 획득. 둘 다 맞혔으므로 각 +20점!', after: ['A 예측 적중 · +20점', 'B 예측 적중 · +20점', 'C 동맹 아님'],
  }, '둘 중 한 명이라도 예측을 틀리면 두 사람 모두 동맹 보너스가 없습니다. 고래·가오리에 제거되거나 크라켄에 파괴된 약탈은 동맹을 만들지 않습니다.'),
  'skull-king': lesson('스컬킹은 해적과 숫자 카드를 이깁니다. 하지만 인어가 있으면 인어에게 집니다.', {
    label: '해적 포획', plays: [pirate(0), p('skull-king', '스컬킹', 1), p('jolly-9', '졸리 로저 9', 2)], winner: 1,
    effect: '스컬킹이 해적과 검정 숫자 카드를 이깁니다.', result: 'B가 승리하고 해적 1장 포획 보너스 +30점을 적립합니다.',
  }, '인어·해적·스컬킹이 함께 나오면 인어가 승리합니다. 포획 보너스는 예측 적중 시 받습니다.'),
  'mermaid-alyra': {
    rule: '인어는 숫자 카드를 이기고 일반 해적에게 집니다. 스컬킹이나 Con이 있으면 그들을 이깁니다.',
    examples: [
      { label: '세 캐릭터의 상성', plays: [pirate(0), p('skull-king', '스컬킹', 1), p('mermaid-alyra', '인어', 2)], winner: 2, effect: '스컬킹이 등장했으므로 인어가 스컬킹을 잡습니다. 해적도 함께 있지만 인어가 승리합니다.', result: 'C가 트릭과 스컬킹 포획 보너스 +40점 적립을 얻습니다.' },
      { label: '해적과 맞붙으면', plays: [green9, p('mermaid-alyra', '인어', 1), pirate(2)], winner: 2, effect: '스컬킹이나 Con이 없는 트릭에서는 해적이 인어를 이깁니다.', result: 'C가 트릭과 인어 포획 보너스 +20점 적립을 얻습니다.' },
    ],
  },
  'wild-monkey-15': lesson('와일드 몽키는 검정을 제외한 수트의 숫자 15입니다. 리드 수트가 없으면 앵무새·지도·보물 중 하나를 선언합니다.', {
    label: '수트를 선언하는 15', plays: [p('wild-monkey-15', '와일드 몽키 15', 0, '앵무새 선언'), p('parrot-14', '앵무새 14', 1), escape(2)], winner: 0,
    effect: 'A가 앵무새 수트를 선언합니다. 와일드 몽키가 앵무새 15가 되어 앵무새 14를 이깁니다.', result: 'A가 트릭을 가져가고 잡은 기본 앵무새 14의 +10점을 적립합니다.',
  }, '초록·보라·노랑이 리드되면 그 수트로 냅니다. 검정으로 선언할 수 없으므로 검정 트럼프에는 집니다.'),
  'first-mate-con': lesson('일등항해사 Con은 일반 해적보다 강하고 스컬킹·인어보다 약합니다. 승리하면 잡은 해적들의 능력을 차례로 쓸 수 있습니다.', {
    label: '해적 능력 가져오기', plays: [pirate(0), p('first-mate-con', '일등항해사 Con', 1), p('pirate-harry', '해적 Harry', 2)], winner: 1,
    effect: 'Con이 Rosie와 Harry를 모두 이깁니다. 해적 포획 점수 대신 두 해적의 능력을 사용합니다.', result: '해적 능력 옵션이 켜져 있다면 B가 Rosie로 다음 리더를 고르고, Harry로 자신의 예측을 조정합니다.', after: ['Rosie → 다음 리더 선택', 'Harry → 내 예측 ±1 또는 유지'],
  }, '스컬킹 또는 인어가 Con을 잡으면 +30점을 적립합니다. 마지막 트릭 뒤에는 Harry 능력만 쓸 수 있습니다.'),
  'last-volley': lesson('마지막 포격을 내면 모두 첫 카드를 낸 뒤, 내가 한 장을 추가로 냅니다. 손패를 한 장 더 썼으므로 라운드 마지막 트릭에는 빠집니다.', {
    label: '나만 한 장 더 내기', plays: [p('last-volley', '마지막 포격', 0), p('map-7', '지도 7', 1), escape(2), p('skull-king', '스컬킹', 0, '추가 카드')], winner: 0,
    effect: '세 사람의 첫 카드가 모였습니다. 이제 A가 스컬킹 한 장을 추가로 냅니다. 마지막 포격 자체는 승리 카드가 아닙니다.', result: '추가 스컬킹으로 A가 승리합니다. A의 손패는 다른 사람보다 1장 적어 마지막 트릭은 B와 C만 진행합니다.', after: ['현재 트릭 A +1', '라운드 마지막 트릭 B·C만 참여'],
  }, '라운드 마지막 트릭에 내서 추가 손패가 없다면 한 장을 더 낼 수 없고, 건너뛸 트릭도 없습니다.'),
  'walk-the-plank': lesson('판자 걷기는 트릭의 일반 해적 한 장을 제거합니다. 여러 해적이 있으면 이 카드를 낸 사람이 고릅니다.', {
    label: '승리할 해적을 제거', plays: [green9, pirate(1), p('walk-the-plank', '판자 걷기', 2)], removed: [1, 2], winner: 0,
    effect: 'C가 Rosie를 제거합니다. 제거된 해적은 승자 판정·스컬킹 보너스·Con 능력에서 빠집니다.', result: '해적이 사라져 앵무새 9를 낸 A가 승리합니다. 판자 걷기 자체는 승리 카드가 아닙니다.',
  }, '해적으로 선언한 티그리스도 제거할 수 있습니다. 스컬킹·인어·Con은 제거할 수 없습니다.'),
  'parrot-zero-fourteen': {
    rule: '확장 0/14는 낼 때 숫자 0 또는 14를 선언합니다. 같은 수트를 따라내야 하는 숫자 카드입니다.',
    note: '14로 내도 기본 14 카드의 보너스는 없습니다. 같은 숫자는 먼저 낸 카드가 이깁니다.',
    examples: [
      { label: '14로 승리하기', plays: [green9, p('parrot-zero-fourteen', '앵무새 0/14', 1, '14 선언'), escape(2)], winner: 1, effect: 'B가 14를 선언합니다. 같은 앵무새 수트에서 14가 9를 이깁니다.', result: 'B가 승리하지만 확장 0/14 자체의 14 보너스는 0점입니다.' },
      { label: '0으로 트릭 피하기', plays: [green9, p('parrot-zero-fourteen', '앵무새 0/14', 1, '0 선언'), escape(2)], winner: 0, effect: 'B가 0을 선언합니다. 앵무새 0은 앵무새 9보다 작습니다.', result: 'A가 승리합니다. B는 수트를 따라내면서 트릭 획득을 피했습니다.' },
    ],
  },
  'parrot-8-expansion': lesson('확장 7·8은 일반 숫자처럼 수트를 따라 냅니다. 트릭을 가져간 사람에게만 확장 7은 −5점, 확장 8은 +5점이 적립됩니다.', {
    label: '숫자 승리와 점수는 별개', plays: [p('parrot-7-expansion', '확장 앵무새 7 (−5)', 0), p('parrot-8-expansion', '확장 앵무새 8 (+5)', 1), p('parrot-9', '앵무새 9', 2)], winner: 2,
    effect: '같은 앵무새 수트에서 9가 가장 큽니다. 확장 카드의 점수는 이 카드들을 낸 사람이 아닌 승자에게 모입니다.', result: 'C가 트릭을 가져갑니다. 확장 보너스 합계는 −5 + 5 = 0점입니다.', after: ['확장 7 → 승자 −5', '확장 8 → 승자 +5'],
  }, '기본 덱의 7·8은 이런 점수가 없습니다. 확장 점수도 라운드 예측을 맞혔을 때만 반영됩니다.'),
};

const abilities: Array<[string, string, string, string, string[]]> = [
  ['pirate-rosie', "Rosie D’Laney", '다음 트릭의 리더를 자신을 포함한 플레이어 중에서 고릅니다.', 'B가 C를 선택합니다. 승리한 B 대신 C가 다음 트릭의 첫 카드를 냅니다.', ['A 대기', 'B 능력 사용', 'C 다음 리더']],
  ['pirate-bendt', 'Bendt the Bandit', '남은 덱에서 2장을 가져온 뒤 손패에서 원하는 2장을 버립니다.', 'B의 남은 손패가 3장이라면 2장을 받아 5장, 원하는 2장을 버려 다시 3장이 됩니다.', ['손패 3장 → 5장', '2장 선택해서 버리기', '손패 다시 3장']],
  ['pirate-rascal', 'Rascal of Roatan', '0·10·20점 중 하나를 겁니다. 라운드 예측 적중 시 더하고 실패하면 뺍니다.', 'B가 20점을 겁니다. 라운드에서 2 예측·2 획득이면 +20점, 2 예측·3 획득이면 −20점입니다.', ['20점 걸기', '예측 성공 → +20', '예측 실패 → −20']],
  ['pirate-juanita', 'Juanita Jade', '이번 라운드에 나눠 주지 않은 남은 덱을 자신만 확인합니다.', 'B만 남은 덱을 봅니다. 덱에 스컬킹이 있으면 이번 라운드에는 아무도 그 카드를 받지 않았다는 것을 알 수 있습니다.', ['B만 남은 덱 확인', 'A·C에게는 비공개', '확인 후 다음 트릭']],
  ['pirate-harry', 'Harry the Giant', '현재 라운드의 내 예측을 1 낮추거나, 유지하거나, 1 높입니다.', 'B의 예측이 1이었다면 0·1·2 중 선택합니다. 예측을 2로 바꾼 뒤 총 2트릭을 따면 예측 적중입니다.', ['예측 1', '0 / 1 / 2 중 선택', '예측 2로 변경']],
  ['mary-thorne', 'Mary Thorne', '플레이어 한 명을 골라 그 사람 손패의 무작위 한 장을 다음 트릭에 내도록 강제합니다.', 'B가 C를 선택합니다. C의 손패에서 무작위로 정해진 탈출 카드는 다음 트릭에 반드시 내야 합니다.', ['B가 C 선택', 'C의 무작위 카드 → 탈출', '다음 트릭 C는 탈출 고정']],
];
for (const [art, name, rule, result, after] of abilities) {
  cardLessons[art] = lesson(`해적으로 숫자 카드와 인어를 이깁니다. ${rule}`, {
    label: '승리 후 능력 사용', plays: [green9, p(art, name, 1), p('mermaid-alyra', '인어', 2)], winner: 1,
    effect: `B의 ${name}가 승리하여 인어 포획 +20점을 적립합니다. 이어서 해적 능력을 사용합니다.`, result, after,
  }, '해적 능력 옵션을 켰을 때 승리 직후 사용합니다. Harry만 마지막 트릭 뒤에도 능력을 쓸 수 있습니다. 보너스는 라운드 예측 적중 시 받습니다.');
}
