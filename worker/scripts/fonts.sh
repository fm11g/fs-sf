#!/usr/bin/env bash
# 렌더용 한글 폰트를 시스템 폰트로 설치 (Chrome이 font-family 이름으로 바로 사용)
# 영상 편집기의 폰트 목록(lib/fonts.ts)과 같은 폰트들
set -uo pipefail
DIR="${HOME}/.fonts/tpf"
mkdir -p "$DIR"
BASE="https://raw.githubusercontent.com/google/fonts/main/ofl"
FAIL=0
get() { [ -s "$DIR/$2" ] || curl -fsSL --retry 3 "$BASE/$1" -o "$DIR/$2" || { echo "폰트 받기 실패: $1"; FAIL=$((FAIL+1)); rm -f "$DIR/$2"; }; }
get "blackhansans/BlackHanSans-Regular.ttf" "BlackHanSans-Regular.ttf"
get "dohyeon/DoHyeon-Regular.ttf" "DoHyeon-Regular.ttf"
get "gothica1/GothicA1-Regular.ttf" "GothicA1-Regular.ttf"
get "gothica1/GothicA1-Bold.ttf" "GothicA1-Bold.ttf"
get "gothica1/GothicA1-Black.ttf" "GothicA1-Black.ttf"
get "notosanskr/NotoSansKR%5Bwght%5D.ttf" "NotoSansKR-VF.ttf"
get "jua/Jua-Regular.ttf" "Jua-Regular.ttf"
get "nanumgothic/NanumGothic-Regular.ttf" "NanumGothic-Regular.ttf"
get "nanumgothic/NanumGothic-Bold.ttf" "NanumGothic-Bold.ttf"
get "nanumgothic/NanumGothic-ExtraBold.ttf" "NanumGothic-ExtraBold.ttf"
get "nanummyeongjo/NanumMyeongjo-ExtraBold.ttf" "NanumMyeongjo-ExtraBold.ttf"
get "nanumpenscript/NanumPenScript-Regular.ttf" "NanumPenScript-Regular.ttf"
get "gowundodum/GowunDodum-Regular.ttf" "GowunDodum-Regular.ttf"
get "sunflower/Sunflower-Bold.ttf" "Sunflower-Bold.ttf"
get "ibmplexsanskr/IBMPlexSansKR-Bold.ttf" "IBMPlexSansKR-Bold.ttf"
get "notoserifkr/NotoSerifKR%5Bwght%5D.ttf" "NotoSerifKR-VF.ttf"
get "dongle/Dongle-Bold.ttf" "Dongle-Bold.ttf"
get "gasoekone/GasoekOne-Regular.ttf" "GasoekOne-Regular.ttf"
get "hahmlet/Hahmlet%5Bwght%5D.ttf" "Hahmlet-VF.ttf"
fc-cache -f "$DIR"
echo "설치된 폰트 파일: $(ls "$DIR" | wc -l) (실패 $FAIL)"
# 기본 폰트(Noto Sans KR·Black Han Sans)가 없으면 렌더 중단
[ -s "$DIR/NotoSansKR-VF.ttf" ] && [ -s "$DIR/BlackHanSans-Regular.ttf" ] || exit 1
