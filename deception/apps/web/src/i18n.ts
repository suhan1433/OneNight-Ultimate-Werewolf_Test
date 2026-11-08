import i18next from "i18next";
import { initReactI18next } from "react-i18next";
void i18next.use(initReactI18next).init({
  lng: "ko",
  fallbackLng: "ko",
  interpolation: { escapeValue: false },
  resources: {
    ko: {
      translation: {
        title: "네온 사건파일",
        nickname: "닉네임",
        create: "수사실 만들기",
        join: "코드로 입장",
        help: "도움말",
        leave: "나가기",
        forensic: "법의학자",
        murderer: "범인",
        accomplice: "공범",
        witness: "목격자",
        investigator: "수사관",
        DEAL: "사건 자료 배부",
        ROLE_REVEAL: "비밀 역할 확인",
        CRIME_NIGHT: "항구의 밤",
        SCENE_INTRO: "현장 도착",
        EVIDENCE_COLLECTION: "증거 수집",
        PRESENTATION: "발표",
        ROUND_TRANSITION: "새로운 단서",
        SOLVING: "해결 시도",
        REVERSAL: "마지막 반전",
        RESULT: "사건 종료",
      },
    },
  },
});
export default i18next;
