#!/usr/bin/env bash
set -euo pipefail
echo "Creando un enlace HTTPS temporal gratuito para probar Grayxon LIVE Tools."
echo "Requiere Docker y conexión a Internet. El enlace cambiará al reiniciar el túnel."
echo "No modifica DNS, Jitsi ni el portal oficial."
docker run --rm --network host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:3017