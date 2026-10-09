import type {RoleType} from '@werewolf/shared';
import merlinArt from './assets/role-art/merlin.jpg';
import percivalArt from './assets/role-art/percival.jpg';
import assassinArt from './assets/role-art/assassin.jpg';
import morganaArt from './assets/role-art/morgana.jpg';
import mordredArt from './assets/role-art/mordred.jpg';
import oberonArt from './assets/role-art/oberon.jpg';
import goodCitizenArt1 from './assets/role-art/good-citizen-1.jpg';
import goodCitizenArt2 from './assets/role-art/good-citizen-2.jpg';
import goodCitizenArt3 from './assets/role-art/good-citizen-3.jpg';
import goodCitizenArt4 from './assets/role-art/good-citizen-4.jpg';
import goodCitizenArt5 from './assets/role-art/good-citizen-5.jpg';
import evilCitizenArt1 from './assets/role-art/evil-citizen-1.jpg';
import evilCitizenArt2 from './assets/role-art/evil-citizen-2.jpg';
import evilCitizenArt3 from './assets/role-art/evil-citizen-3.jpg';

const GOOD_CITIZEN_ART=[goodCitizenArt1,goodCitizenArt2,goodCitizenArt3,goodCitizenArt4,goodCitizenArt5];
const EVIL_CITIZEN_ART=[evilCitizenArt1,evilCitizenArt2,evilCitizenArt3];
const ROLE_ART:Record<Exclude<RoleType,'loyal'|'minion'>,string>={
  merlin:merlinArt,percival:percivalArt,assassin:assassinArt,morgana:morganaArt,mordred:mordredArt,oberon:oberonArt,
};

const stableArtIndex=(key:string,length:number)=>{
  let hash=0;for(const char of key)hash=(hash*31+char.charCodeAt(0))>>>0;
  return hash%length;
};

/** 특수 역할은 동명 일러스트, 반복 시민 역할은 식별자별로 분산된 시민 초상화를 쓴다. */
export function roleArtFor(role:RoleType,variantKey=''){
  if(role==='loyal')return GOOD_CITIZEN_ART[stableArtIndex(variantKey||role,GOOD_CITIZEN_ART.length)]!;
  if(role==='minion')return EVIL_CITIZEN_ART[stableArtIndex(variantKey||role,EVIL_CITIZEN_ART.length)]!;
  return ROLE_ART[role];
}
