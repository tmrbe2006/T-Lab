#!/usr/bin/env bash
# CI-only adapter: use the same MySQL 5.5 client version as the test server.
# The restricted credentials file is mounted read-only into a disposable container.
set -euo pipefail
case "${1:-}" in
  --defaults-extra-file=*) file="${1#--defaults-extra-file=}" ;;
  *) echo 'Missing temporary MySQL options file' >&2; exit 2 ;;
esac
shift
test -r "$file"
docker run --rm --network host --entrypoint /usr/local/mysql/bin/mysqldump \
  --mount "type=bind,source=$file,target=/tmp/tlab-client.cnf,readonly" \
  mysql:5.5 --defaults-extra-file=/tmp/tlab-client.cnf "$@"
