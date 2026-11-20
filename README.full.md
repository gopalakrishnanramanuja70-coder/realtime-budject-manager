# Expensify

A personal budget manager. Create an account, record income and expenses, see where the money goes on a graph, keep to a monthly budget, get tips on what to cut, and learn to use money wisely.

- **Home page** at `/`, **log in or sign up** at `/login`, **the app** at `/app`.
- Every account sees only its own transactions and budgets.
- Built with Java (no framework), SQLite, plain JavaScript, Tailwind CSS and Chart.js.

---

## Before you start (do this once)

You only need **VS Code**, a **web browser** and **internet on the first start**. The first start sets up the rest for you:

| Dependency | What happens |
|---|---|
| **Java JDK 17 or newer** | If it is missing, **Windows** installs Java 21 (Temurin) with `winget` and **macOS** installs it with Homebrew. Click **Yes** if Windows asks for permission. **Linux** cannot install without admin rights, so the task prints the command to run, for example `sudo apt install openjdk-21-jdk`. |
| **SQLite driver** (about 13 MB) | Downloaded automatically into `lib/` and checked against its SHA-1. |
| **Tailwind, Chart.js, font** | Already bundled in `web/vendor/`. Nothing to install. |

Windows 10 or newer (with `winget`, which comes with current Windows 10 and 11), macOS and Linux are supported. VS Code: <https://code.visualstudio.com>.

Optional: VS Code may suggest the **Extension Pack for Java**. It is not needed to run the app.

---

## Start the server in VS Code

1. **Open the project folder.** In VS Code choose **File > Open Folder** and pick the folder that contains `run.sh`, `src` and `web`. In the Explorer panel you should see those three at the top level. If you see only one more folder inside, you opened the wrong level: open that inner folder instead.
2. If VS Code asks *"Do you trust the authors of the files in this folder?"*, choose **Yes**. Tasks cannot run without it.
3. The task **Start Expensify** starts by itself when the folder opens. If VS Code asks *"Allow automatic tasks?"*, choose **Allow**. If it does not start, press **Ctrl+Shift+B** (on a Mac: **Cmd+Shift+B**), or use **Terminal > Run Task... > Start Expensify**.
   Do not run it twice at once: the second copy reports that port 8080 is in use.
4. Wait for the terminal to print:
   ```
   Expensify running at http://localhost:8080
   ```
   The very first start takes a few minutes, because it installs Java if needed, downloads the driver and compiles the code.
   If Java was just installed and the task says it could not be found, close and reopen VS Code and run the task again.
5. Open **<http://localhost:8080>** in your browser (hold Ctrl and click the link in the terminal).
6. **To stop the server:** click inside the terminal and press **Ctrl+C**.

> Leave the terminal open while you use Expensify. Closing it stops the server.

### Start without VS Code

Open a terminal in the project folder and run:

- macOS or Linux: `./run.sh`
- Windows (PowerShell): `powershell -ExecutionPolicy Bypass -File scripts\start.ps1`

---

## First use

1. On the home page click **Create account**. Use any email address and a password of at least 8 characters.
2. On the overview, click **Try with sample data** to see the graphs filled in. **Remove sample data** clears it again.
3. Use **Add transaction** (or the **+** button on a phone) to record your own spending and income.
4. Set limits on the **Budgets** page. The overview and the "Ways to spend less" tips use them.

If you had data saved on this computer before accounts existed, it moves into the **first** account you create.

---

## Use a different port

If port 8080 is already used by another program:

- In VS Code run the task **Start Expensify on port 9090**, then open <http://localhost:9090>.
- Or in a terminal: `./run.sh 9090` (Windows: add `-Port 9090` to the PowerShell command above).

---

## Where your data is stored

Everything is saved in one file, **`expensify.db`**, created in the project folder the first time the server starts.

- **Back up:** stop the server, then copy `expensify.db` (and `expensify.db-wal` and `expensify.db-shm` if they exist) somewhere safe.
- **Start fresh:** stop the server and **rename** `expensify.db` to `expensify.db.old`. A new empty database is created on the next start. Renaming keeps your old data safe; only delete the old file when you are sure you do not need it.

`expensify.db` is ignored by git, so it is never committed by accident.

If you used an earlier version of this app that was called **Hisab**, your `hisab.db` file is renamed to `expensify.db` automatically the first time you start the new version. Your accounts and data are unchanged, but you will be logged out once.

---

## If something goes wrong

| What you see | What to do |
|---|---|
| `could not be found yet` or `javac was not found` | Java was just installed or is missing. Close and reopen VS Code, then run the task again. On Linux install a JDK with the command the task printed. |
| Windows asks for permission, or `winget` is not found | Click **Yes** on the prompt. If `winget` is missing, install a JDK from <https://adoptium.net> and reopen VS Code. |
| `running scripts is disabled` | The task already bypasses this. If you ran the script by hand, use the PowerShell command in "Start without VS Code". |
| `Java 17 or newer is required` | Your JDK is too old. Install a newer one. |
| `Port 8080 is already in use` | Another program is using it. Often it is Expensify already running in another terminal tab: stop that one with Ctrl+C, or use the port 9090 task. |
| `Permission denied` when running `./run.sh` | Run `bash run.sh` instead, or `chmod +x run.sh` once. |
| `Download failed` or a checksum message | Check your internet connection and run again. To do it by hand, download <https://repo1.maven.org/maven2/org/xerial/sqlite-jdbc/3.42.0.1/sqlite-jdbc-3.42.0.1.jar> and save it as `lib/sqlite-jdbc.jar`. Its SHA-1 should be `f97e937f877cf3f2a2d84ce866d399a7da6ef08b`. |
| *Run Task* shows no "Start Expensify" | You opened the wrong folder. See step 1 above. |
| The page does not open, or a file opened as `file:///...` | Expensify must be started with the server. Always use <http://localhost:8080>, never double-click an HTML file. |
| You changed a Java file and nothing changed | Stop the server (Ctrl+C) and start it again. HTML, CSS and JavaScript changes only need a browser refresh. |
| You forgot your password | There is no password reset yet. See "Limits" below. |
| Logged out and sent to the login page | Normal. Sessions last 30 days and end when you click **Log out**. |

---

## Limits to know about

- **Local only.** The server listens on this computer, so other devices on your Wi-Fi cannot open it.
- **Plain HTTP.** That is fine on `localhost`. If you ever put Expensify on the internet it needs HTTPS first.
- **No password reset or email sending.** Passwords are stored hashed and cannot be recovered.
- **Five wrong passwords** for one email lock that login for five minutes.
- The Tailwind file in `web/vendor/` is Tailwind's quick-start build, bundled so the app works offline. For a public deployment, compile Tailwind properly.

---

## Project layout

```
run.sh               start script for macOS and Linux
scripts/start.ps1    start script for Windows
.vscode/tasks.json   the "Start Expensify" task (runs on folder open, or Ctrl+Shift+B)
src/                 Java server
  Main.java            starts the server
  BudgetServer.java    routes, sessions, login rate limit
  Database.java        SQLite: users, sessions, transactions, budgets
  Auth.java            password hashing and tokens
  Transaction.java     transaction model
web/                 pages and assets served to the browser
  home.html, home.css, home.js     public home page
  login.html, login.js, auth.css   log in and sign up
  app.html, app.js, app.css        the budget app
  vendor/                          Tailwind, Chart.js and the font (bundled)
  img/                             screenshots used on the home page
lib/                 SQLite driver (downloaded on first start, not committed)
build/               compiled classes (created on start, not committed)
expensify.db             your data (created on first start, not committed)
```

`BudgetManager.java`, `FileHandler.java` and `ReportGenerator.java` come from the original console version of the project. The web app does not use them.

## For developers: the API

All data endpoints need the login cookie. Requests other than `GET` must send the header `X-Expensify: 1`.

| Method and path | Purpose |
|---|---|
| `GET /api/status` | Whether this is the first account (public) |
| `POST /api/signup`, `POST /api/login`, `POST /api/logout` | Accounts (form body: `email`, `password`) |
| `GET /api/me` | The signed-in email |
| `GET /api/transactions?month=YYYY-MM` | List transactions |
| `POST /api/transactions` | Add (`type`, `category`, `amount`, `date`, `description`) |
| `DELETE /api/transactions/{id}` | Delete one |
| `GET /api/budgets`, `PUT /api/budgets` | Read or set a limit (`category`, `limit`; `TOTAL` is the whole month; limit `0` removes it) |
| `DELETE /api/sample` | Remove the sample data you loaded |
