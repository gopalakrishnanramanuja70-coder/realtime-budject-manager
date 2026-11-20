# Expensify

A personal budget manager. Works on Windows, Mac and Linux.

## Check dependencies

```
node -v
npm -v
javac -version
```

Node must print a version, and `javac` must print 17 or higher.
If `javac` is missing, install Java:

```
winget install -e --id EclipseAdoptium.Temurin.21.JDK
```

(Mac: `brew install --cask temurin@21`. Linux: `sudo apt install openjdk-21-jdk`.)
Then close and reopen the terminal.

## Run

```
npm run dev
```

Wait for `Expensify running at http://localhost:8080`, then open that link and click **Create account**.

The first run downloads the SQLite driver (about 13 MB), so it needs internet once.

Another port:

```
npm run dev -- 9090
```

Stop with **Ctrl+C**.

Your data is saved in `expensify.db` in this folder. The full guide is in `README.full.md`.
