from datetime import date


def normalize_text(value):
    """광고 정보를 검색 및 비교에 사용할 문자열로 변환합니다."""

    if value is None:
        return ""

    if isinstance(value, str):
        return value.strip()

    if isinstance(value, (int, float)):
        return str(value)

    if isinstance(value, list):
        return ", ".join(
            text for item in value
            if (text := normalize_text(item))
        )

    return ""


def get_test_conditions(ad, claim=None):
    """현재 광고 주장과 관련된 시험 정보를 반환합니다."""

    ad = ad or {}
    tests = ad.get("testConditions") or []

    if not isinstance(tests, list):
        return []

    tests = [
        test for test in tests
        if isinstance(test, dict)
    ]

    if claim is None:
        return tests

    test_ids = claim.get("testIds") or []
    source_ids = claim.get("sourceIds") or []

    if test_ids:
        return [
            test for test in tests
            if test.get("id") in test_ids
        ]

    if source_ids:
        return [
            test for test in tests
            if test.get("sourceId") in source_ids
        ]

    # 연결 정보가 없는 시험을 개별 주장에 임의로 적용하지 않습니다.
    return []


def build_search_query(claim_text, ad=None, claim=None):
    """광고 주장과 관련 맥락을 포함한 검색 문장을 구성합니다."""

    ad = ad or {}
    claim = claim or {}

    parts = [claim_text.strip()]

    fields = {
        "productName": "제품명",
        "category": "제품 유형",
        "ingredients": "성분",
        "targetAudience": "광고대상"
    }

    for key, label in fields.items():

        value = normalize_text(ad.get(key))

        if value:
            parts.append(f"{label}: {value}")

    claim_type = normalize_text(claim.get("claimType"))

    if claim_type:
        parts.append(f"주장 유형: {claim_type}")

    for test in get_test_conditions(ad, claim):

        test_fields = {
            "testType": "시험 유형",
            "participants": "시험대상",
            "sampleSize": "시험인원",
            "duration": "시험기간",
            "result": "시험 결과"
        }

        for key, label in test_fields.items():

            value = normalize_text(test.get(key))

            if value:
                parts.append(f"{label}: {value}")

    return "\n".join(parts)


def build_review_queries(ad=None, claim=None):
    """시험 조건의 적용 범위를 검토하기 위한 보조 검색 문장입니다."""

    queries = []

    for test in get_test_conditions(ad, claim):

        participants = normalize_text(
            test.get("participants")
        )

        sample_size = test.get("sampleSize")
        duration = normalize_text(test.get("duration"))
        result = normalize_text(test.get("result"))

        if participants:
            queries.append(
                "인체적용시험 연구 대상자의 연령 및 건강 상태에 따른 "
                "연구 결과의 일반화 가능성과 적용 범위"
            )

        if sample_size is not None or duration:
            queries.append(
                "안전성 시험 표본 규모 시험인원 추적 관찰 기간 "
                "외적 타당성 장기간 안전성 평가의 한계"
            )

        if "자극" in result:
            queries.append(
                "화장품 피부 자극 평가 점수와 피부 감작성 "
                "알레르기 및 이상반응 평가의 차이"
            )

    return list(dict.fromkeys(queries))


def parse_date(value):
    """ISO 형식의 날짜를 변환합니다."""

    if not isinstance(value, str):
        return None

    try:
        return date.fromisoformat(value.strip())

    except ValueError:
        return None


def split_ad_review(ad=None, claim=None):
    """광고 맥락 검토와 날짜 정합성 검토를 분리합니다.

    날짜 항목은 통합 서버에서 규칙 기반 정합성 검증이 담당합니다.
    이 함수를 직접 호출하는 기존 검토에서는 두 결과를 함께 쓸 수 있습니다.
    """

    ad = ad or {}

    findings = []
    date_findings = []

    target = normalize_text(ad.get("targetAudience"))

    tests = get_test_conditions(ad, claim)

    for index, test in enumerate(tests, start=1):

        test_id = normalize_text(test.get("id"))
        test_type = normalize_text(test.get("testType"))

        label = test_type or test_id or f"시험 {index}"

        start_raw = test.get("startDate")
        end_raw = test.get("endDate")

        start = parse_date(start_raw)
        end = parse_date(end_raw)

        participants = normalize_text(
            test.get("participants")
        )

        sample_size = test.get("sampleSize")
        duration = normalize_text(test.get("duration"))
        result = normalize_text(test.get("result"))

        # 1. 시험기간 표기 오류. 통합 실행 시 정합성 검증과 중복되지 않도록 분리합니다.
        if start and end and end < start:

            date_findings.append(
                f"{label}: 광고에 표시된 시험 종료일"
                f"({end_raw})이 시작일({start_raw})보다 "
                "앞섭니다. 원본 시험성적서에서 "
                "정확한 시험기간을 확인하세요."
            )

        elif (
            (start_raw and start is None)
            or (end_raw and end is None)
        ):

            date_findings.append(
                f"{label}: 시험 날짜의 형식 또는 "
                "유효성을 확인할 필요가 있습니다."
            )

        # 2. 광고대상과 시험대상 비교
        infant_terms = (
            "영유아", "영아", "신생아",
            "아기", "유아", "어린이"
        )

        targets_children = any(
            term in target for term in infant_terms
        )

        adult_only = (
            "성인" in participants
            and not any(
                term in participants
                for term in infant_terms
            )
        )

        if targets_children and adult_only:

            findings.append(
                f"{label}: 광고대상은 {target}이지만 "
                f"표시된 시험대상은 {participants}입니다. "
                "성인 대상 시험 결과를 광고대상에게 "
                "적용할 수 있는 추가 자료를 확인하세요."
            )

        # 3. 시험인원 검토
        if (
            isinstance(sample_size, int)
            and not isinstance(sample_size, bool)
            and sample_size > 0
        ):

            findings.append(
                f"{label}: 광고에 표시된 시험인원은 "
                f"{sample_size}명입니다. 시험 결과의 "
                "적용 범위를 판단하려면 대상자 선정 기준, "
                "시험방법 및 이상반응 자료를 확인하세요."
            )

        # 4. 시험기간 검토
        if duration:

            findings.append(
                f"{label}: 광고에 표시된 시험기간은 "
                f"{duration}입니다. 해당 기간을 넘어서는 "
                "장기 사용 안전성 자료가 있는지 확인하세요."
            )

        elif start and end and end >= start:

            elapsed_days = (end - start).days

            findings.append(
                f"{label}: 표시된 시작일과 종료일의 "
                f"차이는 {elapsed_days}일입니다. "
                "실제 사용 기간과 추적 관찰 기간을 확인하세요."
            )

        # 5. 건강한 시험대상자의 적용 범위
        if (
            "건강한" in participants
            or "건강한" in participants.replace(" ", "")
        ):

            findings.append(
                f"{label}: 건강한 대상자를 중심으로 한 "
                "시험인지 확인하고, 피부질환이 있거나 "
                "시험 참여 기준에 해당하지 않는 사용자에게도 "
                "결과를 적용할 수 있는지 확인하세요."
            )

        # 6. 자극도와 이상반응 구분
        if "자극" in result:

            findings.append(
                f"{label}: 광고에 표시된 결과는 "
                f"'{result}'입니다. 평가 점수의 산정 방법과 "
                "별도의 알레르기 및 이상반응 평가 여부를 "
                "확인하세요."
            )

    # 7. 동일 제품의 복수 시험 정보 검토
    if claim is None and len(tests) > 1:

        comparison_fields = (
            "institution",
            "participants",
            "sampleSize",
            "startDate",
            "endDate",
            "duration",
            "testType"
        )

        different_fields = []

        for field in comparison_fields:

            values = {
                normalize_text(test.get(field))
                for test in tests
                if normalize_text(test.get(field))
            }

            if len(values) > 1:
                different_fields.append(field)

        if different_fields:

            findings.append(
                "광고에 서로 다른 조건의 시험 정보가 "
                "표시되어 있습니다. 별도로 실시한 시험일 수 "
                "있으므로 정보가 다르다는 이유만으로 "
                "허위 광고라고 판단할 수 없습니다. "
                "각 시험의 목적과 원본 시험성적서를 확인하세요."
            )

    # 8. 시험성적서 및 완제품 동일성 확인
    if tests:

        findings.append(
            "원본 시험성적서와 실제 판매 제품의 제품명, "
            "제형 및 성분이 일치하는지 확인하세요."
        )

    return list(dict.fromkeys(findings)), list(dict.fromkeys(date_findings))


def review_ad_context(ad=None, claim=None, include_date_checks=True):
    """광고 자체의 시험 정보를 검토합니다.

    광고에 기재된 정보의 진위나 제품 안전성을 확정하지 않습니다.
    include_date_checks가 거짓이면 날짜 역전과 날짜 형식 안내만 제외합니다.
    """

    context_findings, date_findings = split_ad_review(ad, claim)
    findings = list(context_findings)
    if include_date_checks:
        findings.extend(date_findings)
    return list(dict.fromkeys(findings))
