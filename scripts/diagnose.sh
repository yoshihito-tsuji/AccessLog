#!/bin/bash
#
# データフロー診断スクリプト
#
# 目的: GitHub API → CSV → Google Sheets → Dashboard の各ステップを検証し、
#       不整合を検出する
#
# 使用方法:
#   ./scripts/diagnose.sh              # 基本診断（除外後のみ）
#   ./scripts/diagnose.sh --verbose    # 詳細出力
#   ./scripts/diagnose.sh --raw        # 除外前/後の両方を出力
#   ./scripts/diagnose.sh --breakdown  # ダッシュボード値の内訳（日付×アプリ別）
#   ./scripts/diagnose.sh --drops      # 累積値の低下箇所を検出（増分>累積の原因分析）
#

# エラーで即座に終了しない（各ステップを継続）
set +e

# 色設定
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# パス設定
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${ROOT_DIR}/data"
DAILY_DIR="${DATA_DIR}/daily"

# オプション解析
VERBOSE=false
SHOW_RAW=false
SHOW_BREAKDOWN=false
SHOW_DROPS=false
for arg in "$@"; do
    case $arg in
        --verbose|-v) VERBOSE=true ;;
        --raw|-r) SHOW_RAW=true ;;
        --breakdown|-b) SHOW_BREAKDOWN=true ;;
        --drops|-d) SHOW_DROPS=true ;;
    esac
done

# APIのURL
APPS_SCRIPT_API="https://script.google.com/macros/s/AKfycbxZx9xCYNYVepuxRsPpWwd4k4zpuq1yivyC6P3nWEEnbYHaIyelOdgVAGvHhi7-rzYeYw/exec"

# 除外条件（Apps Script / upload_to_sheets.py と統一）
EXCLUDED_SUFFIXES='.sha256 .sha256.txt .sha256sum .sha512 .sha512.txt .sha512sum .md5 .md5sum .sha1 .sha1.txt .sha1sum .checksum .checksum.txt .sig .asc'
JQ_EXCLUDE='endswith(".sha256") or endswith(".sha256.txt") or endswith(".sha256sum") or endswith(".sha512") or endswith(".sha512.txt") or endswith(".sha512sum") or endswith(".md5") or endswith(".md5sum") or endswith(".sha1") or endswith(".sha1.txt") or endswith(".sha1sum") or endswith(".checksum") or endswith(".checksum.txt") or endswith(".sig") or endswith(".asc")'

# 診断結果を格納する変数（エラー時のデフォルト値）
GITHUB_API_TOTAL=0
GITHUB_API_RAW=0
CSV_TOTAL=0
CSV_RAW=0
CSV_DATE="N/A"
SHEETS_TOTAL=0
SHEETS_RAW=0
SHEETS_DATE="N/A"
SHEETS_ROWS=0
API_TOTAL=0
API_LATEST_DATE="N/A"

# エラーカウント
ERROR_COUNT=0

echo -e "${BLUE}========================================"
echo "ダウンロード統計 データフロー診断"
echo "========================================${NC}"
echo ""
echo "実行日時: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ============================================================
# ステップ1: GitHub API
# ============================================================
echo -e "${BLUE}[1/6] GitHub API チェック${NC}"

# GaQ_app
GAQ_JSON=$(gh api repos/yoshihito-tsuji/GaQ_app/releases --paginate 2>/dev/null | tr -d '\000-\037')
if [ -n "$GAQ_JSON" ] && [ "$GAQ_JSON" != "[]" ]; then
    GAQ_API_RAW=$(echo "$GAQ_JSON" | jq '[.[] | select(.draft == false and .prerelease == false) | .assets[].download_count] | add // 0' 2>/dev/null || echo 0)
    GAQ_API_FILTERED=$(echo "$GAQ_JSON" | jq "[.[] | select(.draft == false and .prerelease == false) | .assets[] | select(.name | (${JQ_EXCLUDE}) | not) | .download_count] | add // 0" 2>/dev/null || echo 0)
else
    echo -e "  ${RED}GaQ_app: API取得失敗${NC}"
    GAQ_API_RAW=0
    GAQ_API_FILTERED=0
    ERROR_COUNT=$((ERROR_COUNT + 1))
fi

# Pop_app
POP_JSON=$(gh api repos/yoshihito-tsuji/Pop_app/releases --paginate 2>/dev/null | tr -d '\000-\037')
if [ -n "$POP_JSON" ] && [ "$POP_JSON" != "[]" ]; then
    POP_API_RAW=$(echo "$POP_JSON" | jq '[.[] | select(.draft == false and .prerelease == false) | .assets[].download_count] | add // 0' 2>/dev/null || echo 0)
    POP_API_FILTERED=$(echo "$POP_JSON" | jq "[.[] | select(.draft == false and .prerelease == false) | .assets[] | select(.name | (${JQ_EXCLUDE}) | not) | .download_count] | add // 0" 2>/dev/null || echo 0)
else
    echo -e "  ${RED}Pop_app: API取得失敗${NC}"
    POP_API_RAW=0
    POP_API_FILTERED=0
    ERROR_COUNT=$((ERROR_COUNT + 1))
fi

GITHUB_API_RAW=$((GAQ_API_RAW + POP_API_RAW))
GITHUB_API_TOTAL=$((GAQ_API_FILTERED + POP_API_FILTERED))

if [ "$SHOW_RAW" = true ]; then
    echo -e "  GaQ_app:  除外前=${GAQ_API_RAW}, 除外後=${GREEN}${GAQ_API_FILTERED}${NC}"
    echo -e "  Pop_app:  除外前=${POP_API_RAW}, 除外後=${GREEN}${POP_API_FILTERED}${NC}"
    echo -e "  合計:     除外前=${GITHUB_API_RAW}, 除外後=${GREEN}${GITHUB_API_TOTAL}${NC}"
else
    echo -e "  GaQ_app:  ${GREEN}${GAQ_API_FILTERED}${NC} DL"
    echo -e "  Pop_app:  ${GREEN}${POP_API_FILTERED}${NC} DL"
    echo -e "  合計:     ${GREEN}${GITHUB_API_TOTAL}${NC} DL"
fi
echo ""

# ============================================================
# ステップ2: ローカルCSV
# ============================================================
echo -e "${BLUE}[2/6] ローカルCSV チェック${NC}"

CURRENT_DATE=$(date "+%Y-%m-%d")
LATEST_CSV=$(ls -t "${DAILY_DIR}"/downloads_*.csv 2>/dev/null | head -1)

if [ -z "${LATEST_CSV}" ]; then
    echo -e "  ${RED}エラー: 日次CSVファイルが見つかりません${NC}"
    ERROR_COUNT=$((ERROR_COUNT + 1))
else
    CSV_DATE=$(basename "${LATEST_CSV}" | sed 's/downloads_//' | sed 's/.csv//')

    # Pythonで正確に集計（除外前/後の両方）
    CSV_RESULT=$(python3 -c "
import csv
excluded = ['.sha256', '.sha256.txt', '.sha256sum', '.sha512', '.sha512.txt', '.sha512sum', '.md5', '.md5sum', '.sha1', '.sha1.txt', '.sha1sum', '.checksum', '.checksum.txt', '.sig', '.asc']
total_raw = 0
total_filtered = 0
with open('${LATEST_CSV}', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        asset = row['アセット名'].lower()
        count = int(row['ダウンロード数'])
        total_raw += count
        if not any(asset.endswith(s) for s in excluded):
            total_filtered += count
print(f'{total_raw}:{total_filtered}')
" 2>/dev/null)

    if [ -n "$CSV_RESULT" ]; then
        CSV_RAW=$(echo "$CSV_RESULT" | cut -d: -f1)
        CSV_TOTAL=$(echo "$CSV_RESULT" | cut -d: -f2)
    else
        echo -e "  ${RED}CSVの集計に失敗${NC}"
        ERROR_COUNT=$((ERROR_COUNT + 1))
    fi

    echo -e "  最新CSV:  ${LATEST_CSV}"
    echo -e "  日付:     ${CSV_DATE}"
    if [ "$SHOW_RAW" = true ]; then
        echo -e "  総DL数:   除外前=${CSV_RAW}, 除外後=${GREEN}${CSV_TOTAL}${NC}"
    else
        echo -e "  総DL数:   ${GREEN}${CSV_TOTAL}${NC} DL（チェックサム除外後）"
    fi
fi
echo ""

# ============================================================
# ステップ3: Google Sheets 実測（DailyData直接取得）
# ============================================================
echo -e "${BLUE}[3/6] Google Sheets 実測${NC}"

SHEETS_RESULT=$(python3 -c "
import os
import sys
from collections import defaultdict

os.environ['GOOGLE_SHEETS_CREDENTIALS'] = '${ROOT_DIR}/credentials.json'
os.environ['SPREADSHEET_ID'] = '1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs'

try:
    import gspread
except ImportError:
    print('ERROR: gspreadライブラリが未インストール')
    print('  インストール: pip install gspread oauth2client')
    sys.exit(0)

# 認証方式: oauth2client を優先、なければ google.oauth2 にフォールバック
auth_method = None
try:
    from oauth2client.service_account import ServiceAccountCredentials
    auth_method = 'oauth2client'
except ImportError:
    try:
        from google.oauth2.service_account import Credentials as GoogleCredentials
        auth_method = 'google.oauth2'
    except ImportError:
        print('ERROR: 認証ライブラリが未インストール')
        print('  インストール: pip install oauth2client')
        print('  または: pip install google-auth')
        sys.exit(0)

try:
    credentials_path = os.environ['GOOGLE_SHEETS_CREDENTIALS']
    spreadsheet_id = os.environ['SPREADSHEET_ID']

    if not os.path.exists(credentials_path):
        print('ERROR: 認証ファイルが見つかりません')
        sys.exit(0)

    # 認証方式に応じて認証
    if auth_method == 'oauth2client':
        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        credentials = ServiceAccountCredentials.from_json_keyfile_name(credentials_path, scope)
    else:
        SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
        credentials = GoogleCredentials.from_service_account_file(credentials_path, scopes=SCOPES)

    client = gspread.authorize(credentials)

    spreadsheet = client.open_by_key(spreadsheet_id)
    sheet = spreadsheet.worksheet('DailyData')
    all_values = sheet.get_all_values()

    excluded = ['.sha256', '.sha256.txt', '.sha256sum', '.sha512', '.sha512.txt', '.sha512sum', '.md5', '.md5sum', '.sha1', '.sha1.txt', '.sha1sum', '.checksum', '.checksum.txt', '.sig', '.asc']

    latest_date = None
    daily_totals = defaultdict(lambda: {'all': 0, 'filtered': 0})

    for row in all_values[1:]:
        if not row[0]:
            continue
        date_str = row[0][:10]
        asset = row[4].lower()
        try:
            count = int(row[5])
        except:
            continue

        daily_totals[date_str]['all'] += count
        if not any(asset.endswith(s) for s in excluded):
            daily_totals[date_str]['filtered'] += count

        if latest_date is None or date_str > latest_date:
            latest_date = date_str

    if latest_date:
        print(f'OK:{latest_date}:{daily_totals[latest_date][\"all\"]}:{daily_totals[latest_date][\"filtered\"]}:{len(all_values)-1}')
    else:
        print('ERROR:データなし')
except Exception as e:
    print(f'ERROR:{e}')
" 2>&1)

SHEETS_STATUS=$(echo "${SHEETS_RESULT}" | cut -d: -f1)
if [ "${SHEETS_STATUS}" = "OK" ]; then
    SHEETS_DATE=$(echo "${SHEETS_RESULT}" | cut -d: -f2)
    SHEETS_RAW=$(echo "${SHEETS_RESULT}" | cut -d: -f3)
    SHEETS_TOTAL=$(echo "${SHEETS_RESULT}" | cut -d: -f4)
    SHEETS_ROWS=$(echo "${SHEETS_RESULT}" | cut -d: -f5)
    echo -e "  ステータス: ${GREEN}success${NC}"
    echo -e "  最新日付:   ${SHEETS_DATE}"
    if [ "$SHOW_RAW" = true ]; then
        echo -e "  累積DL数:   除外前=${SHEETS_RAW}, 除外後=${GREEN}${SHEETS_TOTAL}${NC}"
    else
        echo -e "  累積DL数:   ${GREEN}${SHEETS_TOTAL}${NC} DL（チェックサム除外後）"
    fi
    echo -e "  総レコード: ${SHEETS_ROWS} 行"
else
    echo -e "  ステータス: ${YELLOW}skip${NC}"
    echo -e "  ${YELLOW}${SHEETS_RESULT}${NC}"
    echo -e "  ${YELLOW}→ Google Sheets取得をスキップして継続${NC}"
    ERROR_COUNT=$((ERROR_COUNT + 1))
fi
echo ""

# ============================================================
# オプション: 累積値の低下箇所検出 (--drops)
# ============================================================
if [ "$SHOW_DROPS" = true ]; then
    echo -e "${BLUE}【累積値の低下箇所検出】${NC}"
    echo ""

    python3 -c "
import os
import sys
from collections import defaultdict

os.environ['GOOGLE_SHEETS_CREDENTIALS'] = '${ROOT_DIR}/credentials.json'
os.environ['SPREADSHEET_ID'] = '1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs'

try:
    import gspread
except ImportError:
    print('ERROR: gspreadライブラリが未インストール')
    print('  インストール: pip install gspread oauth2client')
    sys.exit(0)

# 認証方式: oauth2client を優先、なければ google.oauth2 にフォールバック
auth_method = None
try:
    from oauth2client.service_account import ServiceAccountCredentials
    auth_method = 'oauth2client'
except ImportError:
    try:
        from google.oauth2.service_account import Credentials as GoogleCredentials
        auth_method = 'google.oauth2'
    except ImportError:
        print('ERROR: 認証ライブラリが未インストール')
        print('  インストール: pip install oauth2client')
        print('  または: pip install google-auth')
        sys.exit(0)

try:
    credentials_path = os.environ['GOOGLE_SHEETS_CREDENTIALS']
    spreadsheet_id = os.environ['SPREADSHEET_ID']

    if not os.path.exists(credentials_path):
        print('ERROR: 認証ファイルが見つかりません')
        sys.exit(0)

    # 認証方式に応じて認証
    if auth_method == 'oauth2client':
        scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
        credentials = ServiceAccountCredentials.from_json_keyfile_name(credentials_path, scope)
    else:
        SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
        credentials = GoogleCredentials.from_service_account_file(credentials_path, scopes=SCOPES)

    gc = gspread.authorize(credentials)
    sh = gc.open_by_key(spreadsheet_id)
    worksheet = sh.worksheet('DailyData')
    all_values = worksheet.get_all_values()
    records = all_values[1:]

    # 除外パターン
    excluded_suffixes = ['.sha256', '.sha256.txt', '.sha256sum', '.sha512', '.sha512.txt', '.sha512sum',
                         '.md5', '.md5sum', '.sha1', '.sha1.txt', '.sha1sum', '.checksum', '.checksum.txt',
                         '.sig', '.asc']

    def is_excluded(asset_name):
        lower = asset_name.lower()
        return any(lower.endswith(suffix) for suffix in excluded_suffixes)

    def classify_platform(repo, asset_name):
        lower = asset_name.lower()
        if is_excluded(lower):
            return None
        is_mac = 'mac' in lower or lower.endswith('.dmg') or '.app' in lower
        is_legacy_windows_zip = lower == 'popup-v1.0.0.zip'
        is_windows = ('windows' in lower or 'portable' in lower or
                      lower.endswith('.exe') or is_legacy_windows_zip or
                      'win32' in lower or 'win64' in lower)
        if is_mac:
            return f'{repo} (Mac)'
        elif is_windows:
            return f'{repo} (Windows)'
        return None

    # 日付ごとにグループ化
    records_by_date = defaultdict(list)
    for row in records:
        timestamp, repo, release_name, tag, asset_name = row[0], row[1], row[2], row[3], row[4]
        count = int(row[5]) if row[5] else 0
        date = timestamp.split()[0] if ' ' in timestamp else timestamp[:10]
        records_by_date[date].append((timestamp, repo, tag, asset_name, count))

    # アプリ×日付×バージョン別に集計
    app_data = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for date, date_records in records_by_date.items():
        latest_ts = max(r[0] for r in date_records)
        for timestamp, repo, tag, asset_name, count in date_records:
            if timestamp != latest_ts:
                continue
            app_name = classify_platform(repo, asset_name)
            if app_name is None:
                continue
            app_data[app_name][date][tag] += count

    all_dates = sorted(set(d for app in app_data.values() for d in app.keys()))

    print('日付          | アプリ            | バージョン | prev → curr | 差分')
    print('--------------|-------------------|------------|-------------|------')

    drops = []
    for app_name in ['GaQ (Mac)', 'GaQ (Windows)', 'PoPuP (Mac)', 'PoPuP (Windows)']:
        if app_name not in app_data:
            continue
        app_dates = app_data[app_name]
        all_versions = set(v for d in app_dates.values() for v in d.keys())

        for version in sorted(all_versions):
            prev_count = None
            for date in all_dates:
                if date in app_dates and version in app_dates[date]:
                    current_count = app_dates[date][version]
                    if prev_count is not None and current_count < prev_count:
                        diff = current_count - prev_count
                        drops.append({'app': app_name, 'version': version, 'date': date, 'prev': prev_count, 'curr': current_count, 'diff': diff})
                        print(f'{date} | {app_name:17} | {version:10} | {prev_count:>4} → {current_count:<4} | {diff}')
                    prev_count = current_count

    total_drop = sum(abs(d['diff']) for d in drops)
    print()
    print(f'検出件数: {len(drops)} 件')
    print(f'低下量の合計: {total_drop}')
    print()

    # 最終累積値を計算（Google Sheetsから）
    final_cumulative = 0
    for app_name in ['GaQ (Mac)', 'GaQ (Windows)', 'PoPuP (Mac)', 'PoPuP (Windows)']:
        if app_name not in app_data:
            continue
        app_dates = app_data[app_name]
        all_versions = set(v for d in app_dates.values() for v in d.keys())
        for version in all_versions:
            last_count = 0
            for date in sorted(app_dates.keys()):
                if version in app_dates[date]:
                    last_count = app_dates[date][version]
            final_cumulative += last_count

    # Apps Script APIから増分合計を取得
    import urllib.request
    import json as json_module
    api_url = 'https://script.google.com/macros/s/AKfycbxZx9xCYNYVepuxRsPpWwd4k4zpuq1yivyC6P3nWEEnbYHaIyelOdgVAGvHhi7-rzYeYw/exec?type=timeline&days=365'
    try:
        with urllib.request.urlopen(api_url, timeout=30) as response:
            api_data = json_module.loads(response.read().decode())
        increment_sum = 0
        for app_name, app_info in api_data.get('apps', {}).items():
            increment_sum += sum(app_info.get('total', []))
    except Exception as api_err:
        print(f'警告: Apps Script API取得失敗 ({api_err})')
        increment_sum = 0

    actual_diff = increment_sum - final_cumulative

    print('【増分合計 vs 最終累積の差分との照合】')
    print(f'  Apps Script API 増分合計: {increment_sum}')
    print(f'  Google Sheets 最終累積: {final_cumulative}')
    print(f'  差分（増分 - 累積）: {actual_diff}')
    print(f'  低下イベント丸め量合計: {total_drop}')
    if total_drop == actual_diff:
        print('  → ✓ 一致: 低下イベントの丸め量が差分の原因')
    else:
        print(f'  → △ 不一致: 丸め量({total_drop}) ≠ 差分({actual_diff})')

except Exception as e:
    print(f'ERROR: {e}')
" 2>&1

    echo ""
fi

# ============================================================
# ステップ4: Apps Script API
# ============================================================
echo -e "${BLUE}[4/6] Apps Script API チェック${NC}"

API_RESPONSE=$(curl -sL "${APPS_SCRIPT_API}?type=timeline&days=365" 2>/dev/null)

if [ -n "$API_RESPONSE" ]; then
    API_STATUS=$(echo "${API_RESPONSE}" | jq -r '.status // "error"' 2>/dev/null)
else
    API_STATUS="error"
fi

if [ "${API_STATUS}" = "success" ]; then
    # 全期間の合計を計算
    API_TOTAL=$(echo "${API_RESPONSE}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
total = 0
for app_name, app_data in data.get('apps', {}).items():
    total += sum(app_data.get('total', []))
print(total)
" 2>/dev/null || echo 0)

    API_LATEST_DATE=$(echo "${API_RESPONSE}" | jq -r '.dates[-1] // "N/A"' 2>/dev/null)

    echo -e "  ステータス: ${GREEN}success${NC}"
    echo -e "  最新日付:   ${API_LATEST_DATE}"
    echo -e "  365日合計:  ${GREEN}${API_TOTAL}${NC} DL（日次増分の合計）"

    # --breakdown: 内訳出力
    if [ "$SHOW_BREAKDOWN" = true ]; then
        echo ""
        echo -e "${BLUE}【内訳: 日付×アプリ別の増分詳細】${NC}"
        echo ""
        echo "${API_RESPONSE}" | python3 -c "
import sys, json

data = json.load(sys.stdin)
dates = data.get('dates', [])
apps = data.get('apps', {})

# アプリ別合計
print('【アプリ別合計】')
grand_total = 0
for app_name in ['GaQ (Mac)', 'GaQ (Windows)', 'PoPuP (Mac)', 'PoPuP (Windows)']:
    total = sum(apps[app_name]['total'])
    print(f'  {app_name}: {total}')
    grand_total += total
print(f'  ────────────────')
print(f'  総合計: {grand_total}')
print()

# 日付×アプリ別詳細（0以外のみ）
print('【日付×アプリ別の増分詳細】')
print('日付          | GaQ(Mac) | GaQ(Win) | PoPuP(Mac) | PoPuP(Win) | 日計')
print('--------------|----------|----------|------------|------------|-----')

for i, date in enumerate(dates):
    gaq_mac = apps.get('GaQ (Mac)', {}).get('total', [0]*len(dates))[i]
    gaq_win = apps.get('GaQ (Windows)', {}).get('total', [0]*len(dates))[i]
    popup_mac = apps.get('PoPuP (Mac)', {}).get('total', [0]*len(dates))[i]
    popup_win = apps.get('PoPuP (Windows)', {}).get('total', [0]*len(dates))[i]
    daily_total = gaq_mac + gaq_win + popup_mac + popup_win

    if daily_total > 0:
        print(f'{date} | {gaq_mac:>8} | {gaq_win:>8} | {popup_mac:>10} | {popup_win:>10} | {daily_total:>4}')
" 2>/dev/null
        echo ""
    fi

    if [ "$VERBOSE" = true ]; then
        echo ""
        echo "  直近7日間の内訳:"
        echo "${API_RESPONSE}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
dates = data.get('dates', [])
apps = data.get('apps', {})
for i in range(-7, 0):
    if i < -len(dates):
        continue
    date = dates[i]
    day_total = 0
    details = []
    for app_name in ['GaQ (Mac)', 'GaQ (Windows)', 'PoPuP (Mac)', 'PoPuP (Windows)']:
        val = apps[app_name]['total'][i]
        day_total += val
        if val > 0:
            details.append(f'{app_name}={val}')
    detail_str = ', '.join(details) if details else '(データなし)'
    print(f'    {date}: {day_total} DL ({detail_str})')
" 2>/dev/null
    fi
else
    echo -e "  ステータス: ${RED}${API_STATUS}${NC}"
    echo -e "  ${RED}Apps Script APIからデータを取得できませんでした${NC}"
    ERROR_COUNT=$((ERROR_COUNT + 1))
fi
echo ""

# ============================================================
# ステップ5: 初日スパイク検出
# ============================================================
echo -e "${BLUE}[5/6] 初日スパイク検出チェック${NC}"

# Apps Script APIのレスポンスが取得できている場合のみ実行
if [ "${API_STATUS}" = "success" ] && [ -n "$API_RESPONSE" ]; then
    SPIKE_RESULT=$(echo "${API_RESPONSE}" | python3 -c "
import sys, json

data = json.load(sys.stdin)
dates = data.get('dates', [])
apps = data.get('apps', {})

warnings = []
for app_name in ['GaQ (Mac)', 'GaQ (Windows)', 'PoPuP (Mac)', 'PoPuP (Windows)']:
    app_info = apps.get(app_name, {})
    versions = app_info.get('versions', {})

    for version, daily_data in versions.items():
        if not daily_data:
            continue

        # 期間内の合計
        total = sum(daily_data)
        if total == 0:
            continue

        # 最初の非ゼロ日を検出
        first_nonzero_idx = None
        first_nonzero_val = 0
        for i, val in enumerate(daily_data):
            if val > 0:
                first_nonzero_idx = i
                first_nonzero_val = val
                break

        if first_nonzero_idx is None:
            continue

        # 残りの日の平均増分を計算
        remaining = [v for v in daily_data[first_nonzero_idx+1:] if v > 0]
        if len(remaining) > 0:
            avg_remaining = sum(remaining) / len(remaining)
        else:
            avg_remaining = 0

        # 初日の値が残り日平均の10倍以上、かつ初日が合計の50%超の場合スパイク警告
        is_spike = (
            first_nonzero_val > 5 and
            (avg_remaining == 0 or first_nonzero_val > avg_remaining * 10) and
            first_nonzero_val > total * 0.5
        )

        if is_spike:
            date_str = dates[first_nonzero_idx] if first_nonzero_idx < len(dates) else '?'
            warnings.append(f'{app_name} / {version}: 初日({date_str})に{first_nonzero_val}DL（合計{total}の{first_nonzero_val*100//total}%）')

if warnings:
    print('SPIKE:' + '|'.join(warnings))
else:
    print('OK')
" 2>/dev/null)

    SPIKE_STATUS=$(echo "${SPIKE_RESULT}" | cut -d: -f1)
    if [ "${SPIKE_STATUS}" = "SPIKE" ]; then
        echo -e "  ${YELLOW}⚠ 初日スパイクの疑い:${NC}"
        echo "${SPIKE_RESULT}" | sed 's/^SPIKE://' | tr '|' '\n' | while read -r line; do
            echo -e "    ${YELLOW}→ ${line}${NC}"
        done
        echo -e "  ${YELLOW}  ベースライン未考慮で累積値が初日に計上されている可能性${NC}"
    else
        echo -e "  ${GREEN}✓${NC} 初日スパイクは検出されませんでした"
    fi
else
    echo -e "  ${YELLOW}△${NC} Apps Script APIデータ未取得のためスキップ"
fi
echo ""

# ============================================================
# ステップ6: 整合性チェック
# ============================================================
echo -e "${BLUE}[6/6] 整合性チェック${NC}"
echo ""

# GitHub API vs ローカルCSV
if [ "${CSV_DATE}" != "N/A" ]; then
    if [ "${CSV_DATE}" = "${CURRENT_DATE}" ]; then
        DIFF_API_CSV=$((GITHUB_API_TOTAL - CSV_TOTAL))
        if [ ${DIFF_API_CSV} -eq 0 ]; then
            echo -e "  ${GREEN}✓${NC} GitHub API ⟷ ローカルCSV: 一致"
        elif [ ${DIFF_API_CSV} -gt 0 ]; then
            echo -e "  ${YELLOW}△${NC} GitHub API ⟷ ローカルCSV: GitHub APIが ${DIFF_API_CSV} 多い"
            echo -e "    ${YELLOW}→ CSVは今日23:59に更新されます${NC}"
        else
            echo -e "  ${RED}✗${NC} GitHub API ⟷ ローカルCSV: 不整合（差: ${DIFF_API_CSV}）"
        fi
    else
        echo -e "  ${YELLOW}△${NC} GitHub API ⟷ ローカルCSV: 日付が異なる (CSV: ${CSV_DATE})"
        echo -e "    ${YELLOW}→ CSVは当日のデータではありません${NC}"
    fi
else
    echo -e "  ${RED}✗${NC} GitHub API ⟷ ローカルCSV: CSV未取得のためスキップ"
fi

# ローカルCSV vs Google Sheets
if [ "${CSV_DATE}" != "N/A" ] && [ "${SHEETS_DATE}" != "N/A" ]; then
    if [ "${CSV_DATE}" = "${SHEETS_DATE}" ]; then
        DIFF_CSV_SHEETS=$((CSV_TOTAL - SHEETS_TOTAL))
        if [ ${DIFF_CSV_SHEETS} -eq 0 ]; then
            echo -e "  ${GREEN}✓${NC} ローカルCSV ⟷ Google Sheets: 一致"
        else
            echo -e "  ${RED}✗${NC} ローカルCSV ⟷ Google Sheets: 不整合（差: ${DIFF_CSV_SHEETS}）"
        fi
    else
        echo -e "  ${YELLOW}△${NC} ローカルCSV ⟷ Google Sheets: 日付が異なる (CSV: ${CSV_DATE}, Sheets: ${SHEETS_DATE})"
    fi
else
    echo -e "  ${YELLOW}△${NC} ローカルCSV ⟷ Google Sheets: 一方が未取得のためスキップ"
fi

# ============================================================
# 診断結果サマリー
# ============================================================
echo ""
echo -e "${BLUE}========================================"
echo "診断結果サマリー"
echo "========================================${NC}"
echo ""
if [ "$SHOW_RAW" = true ]; then
    echo "  GitHub API 現在値:        除外前=${GITHUB_API_RAW}, 除外後=${GITHUB_API_TOTAL} DL"
    echo "  ローカルCSV (${CSV_DATE}):   除外前=${CSV_RAW}, 除外後=${CSV_TOTAL} DL"
    echo "  Google Sheets (${SHEETS_DATE}): 除外前=${SHEETS_RAW}, 除外後=${SHEETS_TOTAL} DL"
else
    echo "  GitHub API 現在値:        ${GITHUB_API_TOTAL} DL（累積）"
    echo "  ローカルCSV (${CSV_DATE}):   ${CSV_TOTAL} DL（累積）"
    echo "  Google Sheets (${SHEETS_DATE}): ${SHEETS_TOTAL} DL（累積）"
fi
echo "  Dashboard 表示:           ${API_TOTAL} DL（選択期間の増分合計）"
echo ""
echo -e "${YELLOW}注意:${NC}"
echo "  ダッシュボードの「合計」は選択した期間（7/30/90/180/365日）の"
echo "  日次増分の合計であり、全期間の累積ダウンロード数ではありません。"
echo ""
echo "  例: 30日間で10DL増加 → ダッシュボード表示は10"
echo "      （累積総数が200でも、30日前から変化がなければ表示は0）"
echo ""

# エラーサマリー
if [ ${ERROR_COUNT} -gt 0 ]; then
    echo -e "${YELLOW}========================================"
    echo "警告サマリー"
    echo "========================================${NC}"
    echo ""
    echo -e "  ${YELLOW}${ERROR_COUNT} 件のステップでエラーまたはスキップが発生${NC}"
    echo ""
    echo "  対処方法:"
    echo "  - GitHub API失敗: gh auth login を実行"
    echo "  - Google Sheets失敗: pip install gspread oauth2client"
    echo "  - 認証ファイル不足: credentials.json を配置"
    echo ""
fi

# 追加の診断情報（詳細モード）
if [ "$VERBOSE" = true ]; then
    echo -e "${BLUE}========================================"
    echo "追加診断情報"
    echo "========================================${NC}"
    echo ""

    # launchd状態
    echo "launchd状態:"
    launchctl list 2>/dev/null | grep -E "com.releases.download-tracker" || echo "  (未登録)"
    echo ""

    # 最近のログ
    echo "最近のトラッカーログ (最新5行):"
    tail -5 "${ROOT_DIR}/logs/tracker.log" 2>/dev/null || echo "  (ログなし)"
    echo ""

    # エラーログ
    echo "最近のエラーログ (最新5行):"
    tail -5 "${ROOT_DIR}/logs/tracker_error.log" 2>/dev/null || echo "  (エラーなし)"
fi

# 終了コード（エラーがあっても0で終了し、スクリプト全体は成功扱い）
exit 0
