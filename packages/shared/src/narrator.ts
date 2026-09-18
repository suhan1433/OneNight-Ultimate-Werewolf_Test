import { ROLE_DEFINITIONS } from './roles.js';
import type { RoleType } from './types.js';

export const NARRATOR_LINES = {
  nightStart: '밤이 되었습니다. 모두 눈을 감아주세요.',
  dayStart: '날이 밝았습니다. 모두 눈을 뜨세요.',
  action(role: RoleType) {
    const r = ROLE_DEFINITIONS[role];
    return `${r.name}, 눈을 뜨세요. ${r.description}`;
  }
};
