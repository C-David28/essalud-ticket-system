#!/bin/sh
set -eu
# Railway monta el volumen con propietario root. Preparar solo el punto de montaje fijo.
mkdir -p /backups
chown node:node /backups
chmod 700 /backups
exec su-exec node "$@"
