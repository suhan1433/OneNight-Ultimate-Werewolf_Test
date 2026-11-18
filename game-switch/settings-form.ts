import { games, type GameId, type Member } from './catalog';
import { defaultSetup, defaultWerewolfDeck, settingFields, setupSummary, validateSetup, werewolfRoles, type SettingField, type SwitchSetup } from './settings';

/** Creates no room until the host submits valid settings. */
export function settingsForm(game: GameId, members: Member[], back: () => void, confirm: (setup: SwitchSetup) => void) {
  const setup = defaultSetup(game, members.length);
  const form = document.createElement('form'); form.className = 'club-switch-settings';
  form.setAttribute('aria-label', `${games[game].label} 설정`);
  const title = document.createElement('h3'); title.textContent = `${games[game].label} 설정`;
  const summary = document.createElement('p'); summary.className = 'club-switch-summary'; summary.setAttribute('aria-live','polite');
  const fields = document.createElement('fieldset');
  const legend = document.createElement('legend'); legend.textContent = '새 대기실 규칙'; fields.append(legend);
  const error = document.createElement('p'); error.className = 'club-switch-validation'; error.setAttribute('role','status');
  const actions = document.createElement('div'); actions.className = 'club-switch-form-actions';
  const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '게임 다시 선택'; previous.onclick = back;
  const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'club-switch-confirm'; submit.textContent = '설정 확정하고 함께 이동';
  actions.append(previous, submit); form.append(title, summary, fields, error, actions);
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  let refreshDeck = () => {};
  const refresh = () => {
    const message = validateSetup(game,setup,members.length);
    error.textContent = message ?? '';
    submit.disabled = !!message;
    summary.textContent = setupSummary(game,setup);
    if (game === 'avalon') {
      const delegate = controls.get('assassinationAbilityRole') as HTMLSelectElement;
      if (setup.values.assassin) setup.values.assassinationAbilityRole = null;
      delegate.disabled = !!setup.values.assassin;
      for (const option of Array.from(delegate.options)) option.disabled = option.value !== 'null' && !setup.values[String(JSON.parse(option.value))];
      delegate.value = JSON.stringify(setup.values.assassinationAbilityRole);
    }
    if (game === 'deception' && members.length < 6) {
      controls.get('accomplice')!.disabled = true; controls.get('witness')!.disabled = true;
    }
    if (game === 'skullking') for (const [key,control] of controls) if (control instanceof HTMLInputElement && control.type === 'checkbox') control.disabled = setup.maxPlayers < 3;
  };
  const addField = (field: SettingField) => {
    const label = document.createElement('label'); label.className = field.checkbox ? 'club-switch-check' : 'club-switch-field';
    const text = document.createElement('span'); text.textContent = field.label;
    let control: HTMLInputElement | HTMLSelectElement;
    if (field.options) {
      const select = document.createElement('select');
      for (const [value,label] of field.options) {
        const option = document.createElement('option'); option.value = JSON.stringify(value); option.textContent = label; select.append(option);
      }
      select.value = JSON.stringify(field.key === 'maxPlayers' ? setup.maxPlayers : setup.values[field.key]); control = select;
    } else {
      const input = document.createElement('input'); input.type = field.checkbox ? 'checkbox' : 'number';
      if (field.checkbox) input.checked = !!setup.values[field.key];
      else { input.min = String(field.min); input.max = String(field.max); input.step = '1'; input.required = true; input.value = String(setup.values[field.key]); }
      control = input;
    }
    control.name = field.key; controls.set(field.key, control);
    control.addEventListener('change', () => {
      const value = control instanceof HTMLSelectElement ? JSON.parse(control.value) : field.checkbox ? control.checked : control.valueAsNumber;
      if (field.key === 'maxPlayers') {
        setup.maxPlayers = Number(value);
        if (game === 'werewolf') { setup.selectedRoles = defaultWerewolfDeck(setup.maxPlayers); refreshDeck(); }
        if (game === 'skullking' && setup.maxPlayers < 3) for (const [key,input] of controls) if (input instanceof HTMLInputElement && input.type === 'checkbox') { setup.values[key] = false; input.checked = false; }
      } else setup.values[field.key] = value;
      if (game === 'avalon' && (setup.values.assassin || !setup.values[String(setup.values.assassinationAbilityRole)])) setup.values.assassinationAbilityRole = null;
      refresh();
    });
    control.addEventListener('input', () => { if (control instanceof HTMLInputElement && control.type === 'number') { setup.values[field.key] = control.valueAsNumber; refresh(); } });
    label.append(text,control);
    if (field.hint) { const hint = document.createElement('small'); hint.textContent = field.hint; label.append(hint); }
    fields.append(label);
  };
  if (game !== 'deception') {
    const capacity: SettingField = { key: 'maxPlayers', label: '대기실 정원', options: Array.from({length:games[game].max-Math.max(members.length,games[game].min)+1},(_,i) => {const n=Math.max(members.length,games[game].min)+i;return [n,`${n}명`];}) };
    addField(capacity);
  }
  settingFields(game).forEach(addField);
  if (game === 'deception') {
    addField({key:'forensicPlayer',label:'법의학자',options:[['','시작할 때 무작위 배정'],...members.map(member => [member.id,member.name] as [string,string])]});
  }
  if (game === 'werewolf') {
    const deck = document.createElement('details'); deck.open = true; deck.className = 'club-switch-deck';
    const caption = document.createElement('summary'); caption.textContent = '등장 역할 카드'; deck.append(caption);
    const note = document.createElement('p'); note.textContent = '정원을 바꾸면 기본 카드 구성으로 재설정됩니다.'; deck.append(note);
    const inputs: [string,HTMLInputElement][] = [];
    for (const role of werewolfRoles) {
      const label = document.createElement('label'); label.className = 'club-switch-role'; label.title = role.description;
      const name = document.createElement('span'); name.textContent = `${role.emoji} ${role.name}`;
      const input = document.createElement('input'); input.type = 'number'; input.name = `role-${role.id}`; input.min = '0'; input.max = String(role.maxCount); input.step = '1'; input.required = true;
      input.addEventListener('input', () => {
        setup.selectedRoles = inputs.flatMap(([id,control]) => Array.from({length:Number.isInteger(control.valueAsNumber)&&control.valueAsNumber>=0&&control.valueAsNumber<=Number(control.max)?control.valueAsNumber:0},()=>id));
        refresh();
        if (!input.validity.valid) { error.textContent = `${role.name}: 0~${role.maxCount}장을 입력해 주세요.`; submit.disabled = true; }
      });
      label.append(name,input); deck.append(label); inputs.push([role.id,input]);
    }
    refreshDeck = () => { for (const [id,input] of inputs) input.value = String(setup.selectedRoles.filter(role => role === id).length); };
    refreshDeck(); fields.append(deck);
  }
  form.onsubmit = event => {
    event.preventDefault();
    const message = validateSetup(game,setup,members.length);
    if (message) { error.textContent = message; return; }
    if (form.reportValidity()) confirm(structuredClone(setup));
  };
  refresh();
  return { form, setBusy(busy: boolean) { fields.disabled = busy; previous.disabled = busy; if (busy) submit.disabled = true; else refresh(); } };
}
