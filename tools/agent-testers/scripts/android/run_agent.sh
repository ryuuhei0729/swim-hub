#!/usr/bin/env bash
# Adapted from pierridotite/mobile-agent-testers@dd6e726 (MIT, see LICENSE.upstream):
# shared test account in the prompt, file writes limited to results/, no cat.
# Runs inside android-emulator-runner once the emulator is up: checks that
# blocked hosts are unreachable, applies the persona's phone settings,
# installs the app and hands the emulator to Claude Code. The agent's output
# goes to results/ (encrypted later), never to the public log.
set -uo pipefail
adb wait-for-device
mkdir -p "results/$PERSONA"
# 1. Blocked hosts must not resolve to a real IP from inside the emulator
for h in $BLOCK_HOSTS; do
  ip=$(adb shell ping -c 1 -W 2 "$h" 2>&1 | head -1 | grep -oE '\(([0-9]{1,3}\.){3}[0-9]{1,3}\)' | tr -d '()')
  case "$ip" in ""|0.0.0.0|127.*) ;; *) echo "$h reachable from the emulator ($ip): aborting"; exit 1 ;; esac
done
# 2. Phone language (the emulator boots in en-US; google_apis images allow adb root).
# Not -change-locale: it switches after boot and restarts services under the emulator action's own adb calls
if [ "$(adb shell getprop persist.sys.locale | tr -d '\r')" != "$LOCALE" ]; then
  adb root >/dev/null 2>&1; sleep 3; adb wait-for-device
  adb shell "setprop persist.sys.locale $LOCALE; setprop ctl.restart zygote"; sleep 10; adb wait-for-device
  for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ] && break; sleep 3; done
fi
# 2b. Internet from inside the emulator. Android validates each network itself (DNS + an HTTP check
# to Google): trust that. Resolving a name with the shell's ping is flaky even when the network works,
# so it is only a second chance (it prints "PING host (IP)" once DNS works; ICMP never answers).
online() {
  adb shell dumpsys connectivity 2>/dev/null | grep 'NetworkAgentInfo{' | grep -q 'INTERNET.*&VALIDATED' && return 0
  adb shell ping -c 1 -W 3 www.google.com 2>&1 | head -1 | grep -qE '\(([0-9]{1,3}\.){3}[0-9]{1,3}\)'
}
for i in $(seq 1 20); do online && break; sleep 3; done
if ! online; then
  echo "No network in the emulator: toggling wifi and mobile data"
  adb shell svc wifi disable; adb shell svc data disable; sleep 3
  adb shell svc wifi enable; adb shell svc data enable
  for i in $(seq 1 20); do online && break; sleep 3; done
fi
if ! online; then
  echo "Still no network: rebooting the emulator once"
  adb reboot; sleep 10; adb wait-for-device
  for i in $(seq 1 60); do [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ] && break; sleep 3; done
  for i in $(seq 1 30); do online && break; sleep 3; done
fi
if ! online; then
  # 原因を切り分けるための診断 (公開ログに出るのは端末とランナーのネットワーク情報だけ)
  echo "::group::Network diagnostics"
  echo "host -> 8.8.8.8 DNS: $(dig +short +time=3 +tries=1 www.google.com @8.8.8.8 | head -1)"
  echo "host resolv.conf: $(grep -E '^nameserver' /etc/resolv.conf | tr '\n' ' ')"
  echo "emulator ping 8.8.8.8 (IP, no DNS): $(adb shell ping -c 1 -W 3 8.8.8.8 2>&1 | head -2 | tr '\n' ' ')"
  echo "emulator ping www.google.com: $(adb shell ping -c 1 -W 3 www.google.com 2>&1 | head -1)"
  echo "emulator TCP 142.250.0.0/16 443: $(adb shell 'echo | toybox nc -w 5 142.251.42.164 443 >/dev/null 2>&1 && echo ok || echo fail')"
  adb shell dumpsys connectivity 2>/dev/null | grep -E "Active default network|NetworkAgentInfo\{|DnsAddresses|PrivateDns|VALIDATED|PARTIAL" | head -12
  adb shell getprop | grep -E "dns|net\.(eth0|wlan0)" | head -10
  echo "::endgroup::"
  echo "::error::The emulator has no network (DNS fails): not starting the agent"; exit 1
fi
echo "Emulator network OK"
# 3. App + persona settings. The package inside the APK wins over app_id
# (which may be the iOS bundle id)
AAPT2=$(ls "${ANDROID_HOME:-/usr/local/lib/android/sdk}"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1)
PKG=$([ -n "$AAPT2" ] && "$AAPT2" dump packagename app.apk 2>/dev/null | tr -d '\r')
if [ -n "$PKG" ] && [ "$PKG" != "$APP_ID" ]; then echo "Package read from the APK (differs from app_id)"; APP_ID=$PKG; fi
export APP_ID
adb install -r -g app.apk || adb install -r app.apk
adb shell settings put system font_scale "${FONT_SCALE:-1.0}"
[ "${THEME:-light}" = dark ] && adb shell cmd uimode night yes
adb emu geo fix "${GEO#*,}" "${GEO%,*}" >/dev/null 2>&1   # longitude first
adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
adb logcat -c; sleep 5
# 4. Optional screen recording, kept in results/ (encrypted like the rest)
REC=""
if [ "${RECORD_VIDEO:-false}" = true ]; then
  adb shell settings put system show_touches 1
  SZ=$(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1); W=${SZ%x*}; H=${SZ#*x}
  RW=$((W * 2 / 3 / 16 * 16)); RH=$((H * RW / W / 16 * 16))   # 2/3 size, multiples of 16 for the encoder
  rm -f /tmp/stop-rec
  # screenrecord stops at 180 s: chain files until the agent is done
  ( i=0; opt="--size ${RW}x${RH}"
    while [ ! -f /tmp/stop-rec ] && [ $i -lt 40 ]; do
      i=$((i + 1)); t0=$(date +%s)
      adb shell screenrecord $opt --bit-rate 4000000 --time-limit 180 "/sdcard/rec_$(printf %02d $i).mp4"
      [ $(($(date +%s) - t0)) -lt 3 ] && opt=""   # size refused: native size
    done ) &
  REC=$!
fi
# 5. The agent: only the listed tools, nothing else
LOGIN="Log in with the shared test account (never change its e-mail, password or plan, never delete it): e-mail ${TEST_LOGIN_EMAIL:?TEST_LOGIN_EMAIL missing} password ${TEST_LOGIN_PASSWORD:?TEST_LOGIN_PASSWORD missing}."
claude -p "Read $BRIEF and personas.json, then do the mission until the final report. PERSONA=$PERSONA PLATFORM=android APP_ID=$APP_ID. Device: ${DEVICE}, font scale x${FONT_SCALE:-1.0}, theme ${THEME:-light}, language $LOCALE. Report anything that does not fit this screen (cut text, off-screen buttons, broken layout). $LOGIN" \
  --model "${MODEL:-sonnet}" --max-turns 400 --output-format json \
  --allowedTools "Bash(adb:*),Bash(python3 scripts/android/screen.py:*),Bash(python3 scripts/android/type.py:*),Bash(sleep:*),Bash(ls:*),Bash(mkdir:*),Read,Edit(./results/**)" \
  --disallowedTools "Read(//proc/**),Read(~/.claude/**),Read(~/.config/**),Read(~/.ssh/**)" \
  > results/agent-output.json 2> results/agent-errors.txt
CODE=$?
if [ -n "$REC" ]; then
  touch /tmp/stop-rec; adb shell pkill -INT screenrecord; sleep 4; kill "$REC" 2>/dev/null
  mkdir -p "results/$PERSONA/video"
  for f in $(adb shell ls /sdcard/ | tr -d '\r' | grep '^rec_'); do adb pull "/sdcard/$f" "results/$PERSONA/video/" >/dev/null 2>&1; done
fi
echo "Agent finished (exit $CODE), $(ls "results/$PERSONA" | wc -l) files"
