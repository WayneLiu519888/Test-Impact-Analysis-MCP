#!/bin/bash
# TIA 敏感信息自查脚本 v3 — 兼容旧版 bash + 完整功能
set -e

# 颜色定义
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m'

JSON_MODE=false
[ "$1" = "--json" ] && JSON_MODE=true

# 排除目录（企业配置层 + 运行时产物 + 依赖）
EXCLUDE_DIRS=":!enterprise/ :!scripts/ :!node_modules/ :!.git/ :!Repository/"

# 敏感模式：每行为 "描述|正则"
PATTERNS=(
  "企业内部域名|codehub\.huawei\.com"
  "个人GitHub账号|WayneLiu"
  "员工工号|1[0-9]{8}"
  "Windows绝对路径|[A-Za-z]:/(Users|Program|Workspace|Wayne)"
)

TOTAL=0
declare -a RESULT_TYPES=()
declare -a RESULT_COUNTS=()

if $JSON_MODE; then
  echo '{"results":['
  FIRST=true
fi

for entry in "${PATTERNS[@]}"; do
  desc="${entry%%|*}"
  regex="${entry##*|}"

  matches=$(git grep -n "$regex" -- $EXCLUDE_DIRS 2>/dev/null || true)

  if [ -n "$matches" ]; then
    count=$(echo "$matches" | wc -l | tr -d ' ')
    TOTAL=$((TOTAL + count))
    RESULT_TYPES+=("$desc")
    RESULT_COUNTS+=("$count")

    if $JSON_MODE; then
      $FIRST || echo -n ","
      FIRST=false
      echo -n "{\"type\":\"$desc\",\"pattern\":\"$regex\",\"count\":$count}"
    else
      echo -e "${RED}⚠️  [$desc]${NC} — $count 处"
      echo "$matches"
      echo "---"
    fi
  fi
done

if $JSON_MODE; then
  echo '],'
  echo '"summary":{"total":'$TOTAL',"status":"'$([ $TOTAL -eq 0 ] && echo 'clean' || echo 'issues_found')'"}}'
else
  echo ""
  if [ $TOTAL -eq 0 ]; then
    echo -e "${GREEN}=== ✅ 自查通过，未发现敏感信息 ===${NC}"
  else
    echo -e "${RED}=== ⚠️  共发现 $TOTAL 处疑似敏感信息 ===${NC}"
    for i in "${!RESULT_TYPES[@]}"; do
      echo -e "  ${YELLOW}${RESULT_TYPES[$i]}${NC}: ${RESULT_COUNTS[$i]} 处"
    done
  fi
fi

exit $([ $TOTAL -eq 0 ] && echo 0 || echo 1)
