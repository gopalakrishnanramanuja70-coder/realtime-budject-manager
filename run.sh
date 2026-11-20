#!/usr/bin/env bash
# Starts Expensify on macOS and Linux: ./run.sh [port] [database-file]
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v javac >/dev/null 2>&1 || ! command -v java >/dev/null 2>&1; then
  if [ "$(uname)" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    echo "Installing Java JDK 21 with Homebrew (one time)..."
    brew install --cask temurin@21
    JH=$(/usr/libexec/java_home -v 21 2>/dev/null || true)
    [ -n "$JH" ] && export PATH="$JH/bin:$PATH"
  fi
fi
if ! command -v javac >/dev/null 2>&1 || ! command -v java >/dev/null 2>&1; then
  echo "Java JDK 17 or newer is required (the compiler 'javac' was not found)." >&2
  echo "Linux: sudo apt install openjdk-21-jdk   (Fedora: sudo dnf install java-21-openjdk-devel)" >&2
  echo "macOS: install Homebrew from https://brew.sh, or a JDK from https://adoptium.net" >&2
  echo "Then close and reopen VS Code and run the task again." >&2
  exit 1
fi
JAVA_MAJOR=$(javac -version 2>&1 | awk '{print $2}' | cut -d. -f1)
if [ "${JAVA_MAJOR:-0}" -lt 17 ]; then
  echo "Java 17 or newer is required, but this is version ${JAVA_MAJOR}. Install a newer JDK and try again." >&2
  exit 1
fi

JAR=lib/sqlite-jdbc.jar
JAR_SHA1=f97e937f877cf3f2a2d84ce866d399a7da6ef08b
if [ ! -f "$JAR" ]; then
  echo "Downloading the SQLite driver (one time, about 13 MB)..."
  mkdir -p lib
  curl -fsSL -o "$JAR" https://repo1.maven.org/maven2/org/xerial/sqlite-jdbc/3.42.0.1/sqlite-jdbc-3.42.0.1.jar
  if ! echo "$JAR_SHA1  $JAR" | sha1sum -c - >/dev/null 2>&1 && ! echo "$JAR_SHA1  $JAR" | shasum -c - >/dev/null 2>&1; then
    mv "$JAR" "$JAR.bad"
    echo "The downloaded driver failed its checksum and was renamed to $JAR.bad. Check your connection and run again." >&2
    exit 1
  fi
fi

mkdir -p build
javac -cp "$JAR" -d build src/*.java
exec java --enable-native-access=ALL-UNNAMED -cp "build:$JAR" Main "${1:-8080}" "${2:-expensify.db}"
