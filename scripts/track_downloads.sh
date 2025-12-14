#!/bin/bash
#
# GitHub Release ダウンロード数追跡スクリプト（複数リポジトリ対応）
#
# 目的: 複数のGitHub Releaseの各アセットのダウンロード数を取得し、
#       CSV形式で記録する
#
# 使用方法:
#   ./scripts/track_downloads.sh
#
# 対象リポジトリ:
#   - yoshihito-tsuji/GaQ_app (GaQ Transcriber)
#   - yoshihito-tsuji/Pop_app (PoPuP)
#
# 出力先:
#   data/ （日次CSV・累積CSV）
#   logs/ （tracker_error.log）
#
# CSV形式:
#   日付,リポジトリ,リリース名,タグ,アセット名,ダウンロード数
#

set -e

# Homebrew PATHを安全に追加（既に含まれている場合はスキップ）
# launchd環境ではplist側で設定済み、手動実行時にも対応
if [[ ":$PATH:" != *":/opt/homebrew/bin:"* ]]; then
    export PATH="/opt/homebrew/bin:$PATH"
fi
if [[ ":$PATH:" != *":/usr/local/bin:"* ]]; then
    export PATH="/usr/local/bin:$PATH"
fi

# 色設定
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# パス設定（リポジトリルートを基準にする）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUTPUT_DIR="${ROOT_DIR}/data"
DAILY_DIR="${OUTPUT_DIR}/daily"
LOG_DIR="${ROOT_DIR}/logs"
CURRENT_DATE=$(date "+%Y-%m-%d")
CURRENT_DATETIME=$(date "+%Y-%m-%d %H:%M:%S")

# エラーログファイル（logs/ に配置）
ERROR_LOG="${LOG_DIR}/tracker_error.log"

# エラーハンドリング関数
log_error() {
    local message="$1"
    echo -e "${RED}❌ エラー: ${message}${NC}" >&2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: ${message}" >> "${ERROR_LOG}"
}

# GitHub API呼び出し関数（エラー詳細を記録）
fetch_releases() {
    local repo="$1"
    local temp_file=$(mktemp)
    local http_code
    local api_output

    # GitHub API呼び出し（エラー出力を一時ファイルに保存）
    if api_output=$(gh api "repos/${repo}/releases?per_page=100" 2>"${temp_file}"); then
        echo "$api_output"
        rm -f "${temp_file}"
        return 0
    else
        local exit_code=$?
        local error_message=$(cat "${temp_file}" 2>/dev/null || echo "不明なエラー")
        log_error "GitHub API呼び出し失敗: ${repo}"
        log_error "終了コード: ${exit_code}"
        log_error "詳細: ${error_message}"
        rm -f "${temp_file}"
        return 1
    fi
}

# GitHub API呼び出し（リトライ付き）
fetch_releases_with_retry() {
    local repo="$1"
    local max_attempts=3
    local base_delay=5  # 秒

    for attempt in $(seq 1 $max_attempts); do
        echo -e "${BLUE}  API呼び出し試行 ${attempt}/${max_attempts}...${NC}" >&2

        if releases_json=$(fetch_releases "${repo}"); then
            echo "$releases_json"
            return 0
        fi

        # 最後の試行でなければリトライ
        if [ $attempt -lt $max_attempts ]; then
            local delay=$((base_delay * (2 ** (attempt - 1))))  # 指数バックオフ: 5秒, 10秒, 20秒
            log_error "リトライ ${attempt}/${max_attempts}: ${delay}秒後に再試行します"
            echo -e "${YELLOW}  ${delay}秒後に再試行します...${NC}" >&2
            sleep $delay
        fi
    done

    log_error "最大リトライ回数(${max_attempts}回)に達しました: ${repo}"
    echo -e "${RED}  最大リトライ回数に達しました${NC}" >&2
    return 1
}

# 日次ログファイル (日付ごと)
DAILY_LOG="${DAILY_DIR}/downloads_${CURRENT_DATE}.csv"

# 累積ログファイル (すべての記録)
CUMULATIVE_LOG="${OUTPUT_DIR}/downloads_all.csv"

# 追跡対象のリポジトリ
REPO_NAMES=("yoshihito-tsuji/GaQ_app" "yoshihito-tsuji/Pop_app")
REPO_DISPLAY_NAMES=("GaQ" "PoPuP")

# ディレクトリ作成（日次ディレクトリとログディレクトリ）
mkdir -p "${DAILY_DIR}" "${LOG_DIR}"

echo -e "${BLUE}========================================"
echo "GitHub Release ダウンロード数追跡"
echo "========================================${NC}"
echo ""
echo "実行日時: ${CURRENT_DATETIME}"
echo "出力先: ${OUTPUT_DIR}"
echo ""

# GitHub CLI が利用可能かチェック
if ! command -v gh &> /dev/null; then
    echo -e "${YELLOW}⚠ GitHub CLI (gh) がインストールされていません${NC}"
    echo "インストール方法: brew install gh"
    exit 1
fi

# jq が利用可能かチェック
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠ jq がインストールされていません${NC}"
    echo "インストール方法: brew install jq"
    exit 1
fi

# GitHub認証チェック
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}⚠ GitHub CLI が認証されていません${NC}"
    echo "認証方法: gh auth login"
    exit 1
fi

# CSVヘッダー (ファイルが存在しない場合のみ)
if [ ! -f "${DAILY_LOG}" ]; then
    echo "記録日時,リポジトリ,リリース名,タグ,アセット名,ダウンロード数" > "${DAILY_LOG}"
fi

if [ ! -f "${CUMULATIVE_LOG}" ]; then
    echo "記録日時,リポジトリ,リリース名,タグ,アセット名,ダウンロード数" > "${CUMULATIVE_LOG}"
fi

# GitHub Release 情報を取得
echo -e "${BLUE}ダウンロード数を取得中...${NC}"
echo ""

# 合計ダウンロード数を計算
total_downloads=0
total_release_count=0

# 各リポジトリを処理
for idx in "${!REPO_NAMES[@]}"; do
    repo="${REPO_NAMES[$idx]}"
    repo_display_name="${REPO_DISPLAY_NAMES[$idx]}"

    echo -e "${BLUE}--- ${repo_display_name} (${repo}) ---${NC}"

    # 全リリースデータを1回のAPI呼び出しで取得（リトライ付き）
    if ! releases_json=$(fetch_releases_with_retry "${repo}"); then
        echo -e "${YELLOW}  API呼び出しに失敗しました（詳細は ${ERROR_LOG} を確認）${NC}"
        echo ""
        continue
    fi

    # リリース数をJSON配列長から取得
    if ! release_count=$(echo "$releases_json" | jq 'length' 2>/dev/null); then
        log_error "jq処理失敗: ${repo} のリリースカウント取得"
        echo -e "${YELLOW}  JSON解析に失敗しました${NC}"
        echo ""
        continue
    fi

    if [ "$release_count" = "0" ] || [ -z "$releases_json" ] || [ "$releases_json" = "[]" ]; then
        echo -e "${YELLOW}  リリースが見つかりませんでした${NC}"
        echo ""
        continue
    fi

    total_release_count=$((total_release_count + release_count))

    # jqを使用してデータを処理
    echo "$releases_json" | jq -r '
        .[] |
        .name as $release_name |
        .tag_name as $tag |
        .assets[] |
        [
            $release_name,
            $tag,
            .name,
            .download_count
        ] | @tsv
    ' | while IFS=$'\t' read -r release_name tag asset_name download_count; do
        # CSVに記録（カンマを含む場合はクォートで囲む）
        echo "\"${CURRENT_DATETIME}\",\"${repo_display_name}\",\"${release_name}\",\"${tag}\",\"${asset_name}\",${download_count}" >> "${DAILY_LOG}"
        echo "\"${CURRENT_DATETIME}\",\"${repo_display_name}\",\"${release_name}\",\"${tag}\",\"${asset_name}\",${download_count}" >> "${CUMULATIVE_LOG}"

        # 合計ダウンロード数を計算
        total_downloads=$((total_downloads + download_count))

        # 結果表示
        echo -e "  ${GREEN}✓${NC} ${release_name} (${tag})"
        echo "    └─ ${asset_name}: ${download_count} DL"
    done

    echo ""
done

echo -e "${BLUE}========================================"
echo "集計結果"
echo "========================================${NC}"
echo -e "対象リポジトリ: ${#REPO_NAMES[@]} 個"
echo -e "総リリース数: ${total_release_count}"
echo -e "総ダウンロード数: ${GREEN}${total_downloads}${NC}"
echo ""
echo -e "${GREEN}✅ ログファイルに記録しました${NC}"
echo "  - 日次ログ: ${DAILY_LOG}"
echo "  - 累積ログ: ${CUMULATIVE_LOG}"
echo ""

# Google Sheetsへのアップロード
echo -e "${BLUE}Google Sheetsにアップロード中...${NC}"

CREDENTIALS_PATH="${GOOGLE_SHEETS_CREDENTIALS:-${ROOT_DIR}/credentials.json}"

SPREADSHEET_ID="1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs" \
GOOGLE_SHEETS_CREDENTIALS="${CREDENTIALS_PATH}" \
python3 "${SCRIPT_DIR}/upload_to_sheets.py"

upload_exit_code=$?

if [ $upload_exit_code -eq 0 ]; then
    echo -e "${GREEN}✅ Google Sheetsにアップロードしました${NC}"
    echo ""
else
    log_error "Google Sheetsへのアップロードに失敗しました（終了コード: ${upload_exit_code}）"
    echo -e "${RED}❌ Google Sheetsへのアップロードに失敗しました${NC}"
    echo -e "${YELLOW}   詳細は ${ERROR_LOG} を確認してください${NC}"
    echo ""
    exit 1
fi
