import type { VerificationStatus } from './status';

// 기존 import 경로 유지용
export * from './status';

export interface EvidenceSource {
  title: string;
  publisher: string;
  year: number;
  url: string;
  isMock?: boolean;
}

export interface Claim {
  id: string;
  text: string;
  status: VerificationStatus;
  summary: string;
  detail: string;
  sources: EvidenceSource[]; // 외부 근거자료 (sourceIds와 다름)
  // 아래는 백엔드가 값이 있을 때만 보내는 필드 (docs/API.md 3절)
  claimType?: string;
  sourceIds?: string[]; // 광고 내부 출처 ID (예: "image1", "video1")
  testIds?: string[]; // 연결된 testConditions.id
  conditions?: string[]; // 이 주장에만 해당하는 조건
  timestamps?: ClaimTimestamp[]; // 영상 속 재생 위치
}

export interface ClaimTimestamp {
  sourceId: string;
  startSeconds: number;
  endSeconds?: number;
}

export interface TestCondition {
  id?: string;
  sourceId?: string;
  testType?: string;
  institution?: string;
  participants?: string;
  sampleSize?: number;
  startDate?: string;
  endDate?: string;
  duration?: string;
  result?: string;
}

// 광고 내부 정합성 (광고 표기 확인 배너)
export type ConsistencyCheckType =
  | 'DATE_INCONSISTENCY' // 시험 종료일이 시작일보다 앞섬
  | 'INVALID_DATE' // 시험기간에 없는 날짜
  | 'PERIOD_MISMATCH' // 안내한 시험 길이와 날짜 범위가 다름
  | 'CHECK_UNAVAILABLE'; // 내부 검증을 끝내지 못함

export interface ConsistencyCheck {
  id: string;
  type: ConsistencyCheckType;
  title: string;
  severity: 'WARNING' | 'INFO';
  description: string;
  originalText: string;
  recommendation: string;
  start?: string;
  end?: string;
  testId?: string;
  sourceId?: string;
}

export interface AnalyzedAd {
  title: string;
  platform: string;
  copy: string;
  productName: string;
  category: string;
  conditions: string[];
  analyzedAt: string;
  brandName?: string;
  targetAudience?: string;
  ingredients?: string[];
  testConditions?: TestCondition[];
}

export interface AnalysisResult {
  ad: AnalyzedAd;
  claims: Claim[];
  consistencyChecks?: ConsistencyCheck[]; // 문제 없으면 []
  checkBeforeBuy: string[];
  disclaimer: string;
}

export const mockResult: AnalysisResult = {
  ad: {
    title: '3주 만에 머리숱이 풍성해지는 두피 앰플!',
    platform: '인스타그램 릴스 (가상)',
    copy: '3주 만에 머리숱이 풍성해지는 두피 앰플! 바르는 순간 두피 열감 케어, 모발 성장까지.',
    productName: '○○ 두피 앰플 (가상 제품)',
    category: '두피·모발 케어',
    conditions: ['3주 사용', '하루 1회 도포 (광고 자막 기준)'],
    analyzedAt: '2026-11-24 14:30',
    brandName: '○○랩 (가상)',
    targetAudience: '탈모가 고민인 성인',
    ingredients: ['비오틴', '판테놀', '살리실릭애씨드'],
    testConditions: [
      {
        id: 'test1',
        sourceId: 'image1',
        testType: '인체적용시험',
        institution: '가상 피부임상센터',
        participants: '성인 남녀 20명',
        sampleSize: 20,
        startDate: '25.03.18',
        endDate: '23.03.20',
        duration: '3주',
        result: '모발 밀도 개선 (광고 표기)',
      },
    ],
  },

  claims: [
    {
      id: 'c1',
      text: '두피 앰플이 탈모 증상 완화에 도움을 준다',
      status: 'SUPPORTED',
      summary: '기능성화장품 관련 공개 자료에서 탈모 증상 완화 표시가 확인됩니다.',
      detail:
        '식약처 공개 자료에서 탈모 증상 완화 기능성화장품이라는 범주와 표시 가능 범위가 확인됩니다. 다만 제품별 기능성 심사 여부는 제품 공식 정보에서 따로 확인해야 합니다. (가상 분석)',
      sources: [
        {
          title: '화장품이 모발성장? 탈모화장품 허위 광고에 주의하세요',
          publisher: '식품의약품안전처',
          year: 2018,
          url: 'https://www.mfds.go.kr/brd/m_662/view.do?seq=4',
        },
      ],
    },
    {
      id: 'c2',
      text: '3주 사용만으로 모발 성장 효과가 나타난다',
      status: 'CONFLICT',
      summary: '탈모 증상 완화와 모발 성장(발모)은 구분되며, 광고 표현이 자료와 충돌합니다.',
      detail:
        '공개 자료는 탈모 증상 완화와 발모·모발 성장 주장을 구분해 설명합니다. 광고의 "모발 성장까지" 표현은 이 구분과 맞지 않을 수 있어 확인이 필요합니다. 단정이 아니라 비교 결과입니다. (가상 분석)',
      sources: [
        {
          title: '화장품이 모발성장? 탈모화장품 허위 광고에 주의하세요',
          publisher: '식품의약품안전처',
          year: 2018,
          url: 'https://www.mfds.go.kr/brd/m_662/view.do?seq=4',
        },
      ],
    },
    {
      id: 'c3',
      text: '3주 만에 머리숱이 눈에 띄게 늘어난다',
      status: 'INSUFFICIENT',
      sourceIds: ['image1'],
      testIds: ['test1'],
      conditions: ['성인 남녀 20명 대상', '3주 사용'],
      timestamps: [{ sourceId: 'video1', startSeconds: 3.5, endSeconds: 6.2 }],
      summary: '"3주" 조건을 뒷받침하는 시험자료가 확인되지 않았습니다.',
      detail:
        '제품 공식 정보와 공개 연구자료에서 3주 사용 시 머리숱 변화를 측정한 시험 결과를 찾지 못했습니다. 일부 자료가 있어도 사용 기간·대상·측정 방법이 광고 조건과 다릅니다. (가상 분석)',
      sources: [
        {
          title: '두피 케어 제품 사용 기간별 변화 관찰 연구 (가상 자료)',
          publisher: '가상 학술 DB',
          year: 2023,
          url: 'https://example.com/mock/study-1',
          isMock: true,
        },
        {
          title: '○○ 두피 앰플 제품 상세 정보 (가상)',
          publisher: '제품 공식 페이지',
          year: 2026,
          url: 'https://example.com/mock/product',
          isMock: true,
        },
      ],
    },
    {
      id: 'c4',
      text: '바르는 순간 두피 열감이 즉시 케어된다',
      status: 'UNVERIFIABLE',
      summary: '관련 정보를 충분히 확보하지 못했습니다.',
      detail:
        '"열감 케어"는 측정 기준이 불분명하고 검색 가능한 공식 자료가 없어 비교할 수 없었습니다. (가상 분석)',
      sources: [], 
    },
  ],

  consistencyChecks: [
    {
      id: 'check1',
      type: 'DATE_INCONSISTENCY',
      title: '시험기간 표기 확인 필요',
      severity: 'WARNING',
      description:
        '추출된 시험 종료일이 시작일보다 앞섭니다. 광고 원문 또는 문구 인식 결과일 수 있어 확인이 필요합니다.',
      originalText: '25.03.18~23.03.20',
      recommendation: '시험성적서 원본 및 정확한 시험기간을 확인해주세요.',
      start: '2025-03-18',
      end: '2023-03-20',
      testId: 'test1',
    },
  ],

  checkBeforeBuy: [
    '제품의 기능성화장품 심사·보고 여부를 제품 공식 정보에서 확인하세요.',
    '3주 사용 조건의 시험자료(대상 인원, 측정 방법)가 공개되어 있는지 확인하세요.',
    '"탈모 증상 완화"와 "모발 성장"은 다른 표현임을 구분해서 보세요.',
  ],

  disclaimer:
    '본 결과는 UI 제작용 가상 예시이며, 광고의 진위를 단정하지 않습니다. 확인 가능한 자료와 비교한 참고 정보입니다.',
};
