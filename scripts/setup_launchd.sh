#!/bin/bash
#
# launchd設定の自動セットアップスクリプト
#
# 目的:
#   1. リポジトリ管理下のplistを~/Library/LaunchAgentsにコピー
#   2. launchdへの登録（unload → load → kickstart）
#   3. 設定反映の成功・失敗を明示的に表示
#
# 使用方法:
#   bash scripts/setup_launchd.sh
#

set -e

# 色設定
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# パス設定
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLIST_SOURCE="${REPO_ROOT}/com.releases.download-tracker.plist"
PLIST_DEST="${HOME}/Library/LaunchAgents/com.releases.download-tracker.plist"
LABEL="com.releases.download-tracker"

echo -e "${BLUE}========================================
launchd設定セットアップ
========================================${NC}"
echo ""

# 1. plistファイルの存在確認
echo -e "${BLUE}[1/4] plistファイルの確認${NC}"
if [ ! -f "${PLIST_SOURCE}" ]; then
    echo -e "${RED}❌ エラー: plistファイルが見つかりません${NC}"
    echo "   パス: ${PLIST_SOURCE}"
    exit 1
fi
echo -e "${GREEN}✅ plistファイルを確認: ${PLIST_SOURCE}${NC}"
echo ""

# 2. plistをLaunchAgentsにコピー
echo -e "${BLUE}[2/4] plistを~/Library/LaunchAgentsにコピー${NC}"
mkdir -p "${HOME}/Library/LaunchAgents"
cp "${PLIST_SOURCE}" "${PLIST_DEST}"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ コピー成功: ${PLIST_DEST}${NC}"
else
    echo -e "${RED}❌ エラー: コピーに失敗しました${NC}"
    exit 1
fi
echo ""

# 3. launchdへの登録（既存設定がある場合はunload）
echo -e "${BLUE}[3/4] launchdへの登録${NC}"

# 既存の登録を確認
if launchctl list | grep -q "${LABEL}"; then
    echo -e "${YELLOW}既存の登録を検出、アンロード中...${NC}"
    launchctl unload "${PLIST_DEST}" 2>/dev/null || true
    echo -e "${GREEN}✅ アンロード完了${NC}"
fi

# ロード
echo -e "${BLUE}ロード中...${NC}"
launchctl load "${PLIST_DEST}"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ ロード成功${NC}"
else
    echo -e "${RED}❌ エラー: ロードに失敗しました${NC}"
    exit 1
fi
echo ""

# 4. 即座にkickstart（動作確認）
echo -e "${BLUE}[4/4] 動作確認（kickstart）${NC}"
launchctl kickstart -k "gui/$(id -u)/${LABEL}"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ kickstart成功（即座に実行されました）${NC}"
else
    echo -e "${RED}❌ 警告: kickstartに失敗しました${NC}"
    echo "   スケジュール実行は正常に行われる可能性があります"
fi
echo ""

# 5. 登録確認
echo -e "${BLUE}========================================
登録確認
========================================${NC}"
if launchctl list | grep -q "${LABEL}"; then
    echo -e "${GREEN}✅ launchdに正常に登録されています${NC}"
    echo ""
    echo "登録情報:"
    launchctl list | grep "${LABEL}"
    echo ""
    echo -e "${BLUE}次回実行予定: 毎日 00:05${NC}"
    echo ""
    echo "ログファイル:"
    echo "  - 標準出力: ${REPO_ROOT}/tracker.log"
    echo "  - エラー出力: ${REPO_ROOT}/tracker_error.log"
else
    echo -e "${RED}❌ エラー: launchdへの登録に失敗しました${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================
セットアップ完了
========================================${NC}"
