#!/usr/bin/env bash
# Установка автоматизации HH: systemd user-сервис (рекомендуется) или cron.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-systemd}"

chmod +x "$ROOT"/*.sh
mkdir -p "$ROOT/logs"

install_systemd() {
  mkdir -p "$HOME/.config/systemd/user"
  cp "$ROOT/systemd/hh-worker.service" "$HOME/.config/systemd/user/hh-worker.service"
  chmod +x "$ROOT/lib/wait-for-proxy.sh"
  systemctl --user daemon-reload
  systemctl --user enable hh-worker.service
  echo ""
  echo "Systemd user-сервис установлен."
  echo "  Запуск:   systemctl --user start hh-worker"
  echo "  Стоп:     systemctl --user stop hh-worker"
  echo "  Статус:   systemctl --user status hh-worker"
  echo "  Лог:      tail -f $ROOT/logs/worker.log"
  echo ""
  echo "Happ: автозапуск через ~/.config/autostart/Happ.desktop (--autostart)"
  echo "  В Happ.conf уже: autoStart=true, systemProxy=true"
  echo ""
  echo "Чтобы воркер стартовал при загрузке ПК (без ручного входа):"
  echo "  loginctl enable-linger $USER"
  echo "  ./install-automation.sh autologin   # автовход GNOME → Happ поднимет прокси"
}

install_autologin() {
  if grep -q '^AutomaticLoginEnable=True' /etc/gdm/custom.conf 2>/dev/null; then
    echo "GDM autologin уже включён для $(grep AutomaticLogin= /etc/gdm/custom.conf | cut -d= -f2)"
    return 0
  fi
  echo "Включаю автовход GDM для пользователя $USER (нужен sudo)..."
  sudo sed -i 's/^AutomaticLoginEnable=False/AutomaticLoginEnable=True/' /etc/gdm/custom.conf
  grep -E 'AutomaticLogin' /etc/gdm/custom.conf
  echo ""
  echo "После перезагрузки: вход в GNOME автоматически → Happ --autostart → прокси 10808/10809"
}

install_linkedin_systemd() {
  mkdir -p "$HOME/.config/systemd/user"
  cp "$ROOT/systemd/linkedin-worker.service" "$HOME/.config/systemd/user/linkedin-worker.service"
  systemctl --user daemon-reload
  systemctl --user enable linkedin-worker.service
  echo ""
  echo "LinkedIn worker (systemd user) установлен."
  echo "  Зависимости: pip install -e '.[linkedin]'  (в .venv)"
  echo "  Логин 1 раз: ./linkedin-login-once.sh"
  echo "  Запуск:      systemctl --user start linkedin-worker"
  echo "  Лог:         tail -f $ROOT/platforms/linkedin/logs/worker.log"
  echo ""
  echo "Старый li-worker из ~/Documents/li-easy-apply отключи:"
  echo "  systemctl --user disable --now li-worker.service 2>/dev/null || true"
}

install_cron() {
  CRON_FILE="$ROOT/hh-crontab.local"
  cat >"$CRON_FILE" <<EOF
# HH Applicant Tool — $ROOT
SHELL=/bin/bash
PATH=$ROOT/.venv/bin:/usr/local/bin:/usr/bin:/bin

# Токен — каждые 30 мин
*/30 * * * * cd $ROOT && .venv/bin/python -m hh_applicant_tool refresh-token >> $ROOT/logs/cron.log 2>&1

# Автоподнятие резюме — каждые 4 ч (случайная задержка 1–5 мин)
0 */4 * * * /bin/bash -c 'sleep \$((60 + RANDOM % 241))' && cd $ROOT && .venv/bin/python -m hh_applicant_tool update-resumes >> $ROOT/logs/cron.log 2>&1

# Ответы в чатах — каждый час 8–21
0 8-21 * * * /bin/bash -c 'sleep \$((30 + RANDOM % 91))' && $ROOT/reply-employers.sh >> $ROOT/logs/cron.log 2>&1

# Отклики с AI — каждые 2 ч 8–21 (flock против наложения)
0 8-21/2 * * * flock -n $ROOT/.hh-worker.lock -c '$ROOT/apply-vacancies.sh' >> $ROOT/logs/cron.log 2>&1
EOF
  echo "Crontab-фрагмент записан в: $CRON_FILE"
  echo "Добавь в crontab:  crontab -e"
  echo "Или одной командой:  crontab -l 2>/dev/null; cat $CRON_FILE | crontab -"
}

case "$MODE" in
  systemd) install_systemd ;;
  linkedin) install_linkedin_systemd ;;
  all) install_systemd; install_linkedin_systemd ;;
  cron)    install_cron ;;
  both)    install_systemd; install_cron ;;
  autologin) install_autologin ;;
  full)    install_systemd; install_linkedin_systemd; install_autologin ;;
  *)
    echo "Usage: $0 [systemd|linkedin|all|cron|both|autologin|full]"
    exit 1
    ;;
esac
