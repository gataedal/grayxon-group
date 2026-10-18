#!/usr/bin/env bash
set -euo pipefail

# Deploy only the isolated Grayxon LIVE Tools pilot. Does not modify Jitsi.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT/server"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker no está instalado. No se hizo ningún cambio."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose no está disponible. No se hizo ningún cambio."
  exit 1
fi

echo "Construyendo Grayxon LIVE Tools como servicio independiente..."
docker compose up -d --build

echo
echo "Estado del contenedor:"
docker compose ps
echo
echo "Comprobación local:"
for i in {1..15}; do
  if curl -fsS http://127.0.0.1:3017/health; then
    echo
    echo "Servicio activo localmente en 127.0.0.1:3017."
    echo "El puerto queda ligado a localhost por seguridad y NO es accesible desde Internet todavía."
    echo "Para probar desde otro dispositivo hará falta un proxy HTTPS/subdominio independiente."
    exit 0
  fi
  sleep 2
done
echo "ERROR: el servicio no respondió. Revisa: cd server && docker compose logs --tail=100"
exit 1
