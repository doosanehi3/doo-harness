import { classifyWork } from "./classify-work.js";

const examples = [
  "로그인 버튼 에러만 고쳐줘",
  "프로필 편집에 avatar 업로드 추가",
  "인증 모듈 구조 정리하되 기존 동작 유지",
  "RBAC 시스템 재설계하고 관리자 UI/API/마이그레이션까지"
];

for (const example of examples) {
  const result = classifyWork(example);
  console.log(`${example} -> ${result.workClass} (${result.reasons.join("; ")})`);
}
