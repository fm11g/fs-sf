#!/usr/bin/env bash
# 렌더용 한글 폰트를 시스템 폰트로 설치 (Chrome이 font-family 이름으로 바로 사용)
set -euo pipefail
DIR="${HOME}/.fonts/tpf"
mkdir -p "$DIR"
BASE="https://raw.githubusercontent.com/google/fonts/main/ofl"
get() { [ -s "$DIR/$2" ] || curl -fsSL --retry 3 "$BASE/$1" -o "$DIR/$2"; }
get "blackhansans/BlackHanSans-Regular.ttf" "BlackHanSans-Regular.ttf"
get "dohyeon/DoHyeon-Regular.ttf" "DoHyeon-Regular.ttf"
get "gothica1/GothicA1-Regular.ttf" "GothicA1-Regular.ttf"
get "gothica1/GothicA1-Bold.ttf" "GothicA1-Bold.ttf"
get "gothica1/GothicA1-Black.ttf" "GothicA1-Black.ttf"
get "notosanskr/NotoSansKR%5Bwght%5D.ttf" "NotoSansKR-VF.ttf"
fc-cache -f "$DIR"
fc-list | grep -c tpf
