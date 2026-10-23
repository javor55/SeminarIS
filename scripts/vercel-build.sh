#!/bin/sh
# Build na Vercelu (Vercel spouští skript "vercel-build" místo "build").
# Migrace se aplikují jen při produkčním nasazení; preview nasazení databázi nemění.
set -e

if [ "$VERCEL_ENV" = "production" ]; then
  echo "Produkční nasazení: aplikuji migrace databáze"
  npx prisma migrate deploy
else
  echo "Nasazení '${VERCEL_ENV:-local}': migrace se přeskakují"
fi

npx next build
