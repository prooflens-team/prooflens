// 검증 상태 4가지. 라벨·설명·색상은 여기서만 수정

export type VerificationStatus =
  | 'SUPPORTED'
  | 'CONFLICT'
  | 'INSUFFICIENT'
  | 'UNVERIFIABLE';

export const STATUS_ORDER: VerificationStatus[] = [
  'SUPPORTED',
  'CONFLICT',
  'INSUFFICIENT',
  'UNVERIFIABLE',
];

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  SUPPORTED: '근거 확인',
  CONFLICT: '근거와 불일치',
  INSUFFICIENT: '근거 부족',
  UNVERIFIABLE: '확인 불가',
};

export const STATUS_DESC: Record<VerificationStatus, string> = {
  SUPPORTED: '해당 주장을 뒷받침하는 자료가 확인됨',
  CONFLICT: '확인된 자료와 광고 주장이 충돌함',
  INSUFFICIENT: '자료만으로 해당 효과를 뒷받침하기 어려움',
  UNVERIFIABLE: '관련 정보를 충분히 확보하지 못함',
};

export const STATUS_TONE: Record<VerificationStatus, 'ok' | 'bad' | 'warn' | 'muted'> = {
  SUPPORTED: 'ok',
  CONFLICT: 'bad',
  INSUFFICIENT: 'warn',
  UNVERIFIABLE: 'muted',
};

// 모르는 값이 오면 '확인 불가'로 표시
export function toStatus(value: string): VerificationStatus {
  return (STATUS_ORDER as string[]).includes(value)
    ? (value as VerificationStatus)
    : 'UNVERIFIABLE';
}

export const countByStatus = (claims: { status: VerificationStatus }[]) =>
  STATUS_ORDER.reduce(
    (acc, s) => ({ ...acc, [s]: claims.filter((c) => c.status === s).length }),
    {} as Record<VerificationStatus, number>,
  );
