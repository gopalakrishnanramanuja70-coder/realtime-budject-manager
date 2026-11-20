import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

public class BudgetServer {
    private static final Pattern MONTH = Pattern.compile("\\d{4}-\\d{2}");
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final String COOKIE = "expensify_session";
    private static final long SESSION_MILLIS = 30L * 24 * 60 * 60 * 1000;
    private static final int MAX_FAILURES = 5;
    private static final long LOCK_MILLIS = 5 * 60 * 1000;
    private static final Map<String, String> TYPES = Map.of(
            "html", "text/html; charset=utf-8", "css", "text/css; charset=utf-8",
            "js", "text/javascript; charset=utf-8", "woff2", "font/woff2",
            "svg", "image/svg+xml", "json", "application/json; charset=utf-8", "ico", "image/x-icon",
            "png", "image/png", "webp", "image/webp");
    private static final Map<String, String> PAGES = Map.of("/", "home.html", "/login", "login.html", "/app", "app.html");

    private final Database db;
    private final Path webRoot;
    private final int port;
    private final Map<String, long[]> failures = new HashMap<>();
    private final byte[] dummySalt = Auth.newSalt();
    private final byte[] dummyHash = Auth.hash("not-a-real-password", dummySalt);

    public BudgetServer(Database db, Path webRoot, int port) {
        this.db = db;
        this.webRoot = webRoot.toAbsolutePath().normalize();
        this.port = port;
    }

    public void start() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 0);
        server.createContext("/api/", this::api);
        server.createContext("/", this::staticFile);
        server.start();
        System.out.println("Expensify running at http://localhost:" + port);
    }

    private void api(HttpExchange ex) throws IOException {
        try {
            if (!hostAllowed(ex)) {
                send(ex, 403, "{\"error\":\"forbidden host\"}");
                return;
            }
            String method = ex.getRequestMethod();
            if (!method.equals("GET") && ex.getRequestHeaders().getFirst("X-Expensify") == null) {
                send(ex, 403, "{\"error\":\"missing X-Expensify header\"}");
                return;
            }
            String path = ex.getRequestURI().getPath();

            if (path.equals("/api/status") && method.equals("GET")) {
                boolean first = db.userCount() == 0;
                send(ex, 200, "{\"firstAccount\":" + first + ",\"unclaimed\":" + (first && db.hasUnclaimedData()) + "}");
                return;
            }
            if (path.equals("/api/signup") && method.equals("POST")) {
                signup(ex);
                return;
            }
            if (path.equals("/api/login") && method.equals("POST")) {
                login(ex);
                return;
            }
            if (path.equals("/api/logout") && method.equals("POST")) {
                String token = sessionToken(ex);
                if (token != null) db.deleteSession(Auth.sha256(token));
                send(ex, 200, "{}", clearCookie());
                return;
            }

            String token = sessionToken(ex);
            Integer uid = token == null ? null : db.sessionUser(Auth.sha256(token));
            if (uid == null) {
                send(ex, 401, "{\"error\":\"Log in to continue.\"}");
                return;
            }
            int userId = uid;

            if (path.equals("/api/me") && method.equals("GET")) {
                send(ex, 200, "{\"email\":" + quote(db.email(userId)) + "}");
            } else if (path.equals("/api/transactions")) {
                if (method.equals("GET")) {
                    String month = params(ex.getRequestURI().getRawQuery()).get("month");
                    if (month != null && !MONTH.matcher(month).matches()) throw new IllegalArgumentException("month must be YYYY-MM");
                    StringBuilder sb = new StringBuilder("[");
                    for (Transaction t : db.list(userId, month)) {
                        if (sb.length() > 1) sb.append(",");
                        sb.append(json(t));
                    }
                    send(ex, 200, sb.append("]").toString());
                } else if (method.equals("POST")) {
                    Map<String, String> f = params(body(ex));
                    String idParam = f.get("id");
                    Transaction t = db.add(userId, idParam == null ? null : Integer.valueOf(idParam),
                            f.getOrDefault("type", "EXPENSE"), text(f, "category", 40),
                            Double.parseDouble(f.getOrDefault("amount", "0")),
                            f.getOrDefault("date", java.time.LocalDate.now().toString()),
                            text(f, "description", 200), "1".equals(f.get("sample")));
                    send(ex, 201, json(t));
                } else {
                    send(ex, 405, "{\"error\":\"method not allowed\"}");
                }
            } else if (path.startsWith("/api/transactions/") && method.equals("DELETE")) {
                int id = Integer.parseInt(path.substring("/api/transactions/".length()));
                boolean deleted = db.delete(userId, id);
                send(ex, deleted ? 200 : 404, deleted ? "{}" : "{\"error\":\"not found\"}");
            } else if (path.equals("/api/budgets")) {
                if (method.equals("GET")) {
                    StringBuilder sb = new StringBuilder("{");
                    for (Map.Entry<String, Double> e : db.budgets(userId).entrySet()) {
                        if (sb.length() > 1) sb.append(",");
                        sb.append(quote(e.getKey())).append(":").append(e.getValue());
                    }
                    send(ex, 200, sb.append("}").toString());
                } else if (method.equals("PUT")) {
                    Map<String, String> f = params(body(ex));
                    db.setBudget(userId, text(f, "category", 40), Double.parseDouble(f.getOrDefault("limit", "0")));
                    send(ex, 200, "{}");
                } else {
                    send(ex, 405, "{\"error\":\"method not allowed\"}");
                }
            } else if (path.equals("/api/sample") && method.equals("DELETE")) {
                send(ex, 200, "{\"removed\":" + db.deleteSamples(userId) + "}");
            } else {
                send(ex, 404, "{\"error\":\"not found\"}");
            }
        } catch (IllegalArgumentException | java.time.DateTimeException e) {
            send(ex, 400, "{\"error\":" + quote(String.valueOf(e.getMessage())) + "}");
        } catch (SQLException e) {
            System.err.println("Database error: " + e.getMessage());
            send(ex, 500, "{\"error\":\"database error\"}");
        }
    }

    private void signup(HttpExchange ex) throws IOException, SQLException {
        Map<String, String> f = params(body(ex));
        String email = f.getOrDefault("email", "").trim().toLowerCase();
        String password = f.getOrDefault("password", "");
        if (email.length() > 254 || !EMAIL.matcher(email).matches()) throw new IllegalArgumentException("Enter a valid email address.");
        if (password.length() < 8) throw new IllegalArgumentException("Use at least 8 characters for your password.");
        if (password.length() > 128) throw new IllegalArgumentException("Use 128 characters or fewer for your password.");
        byte[] salt = Auth.newSalt();
        Integer id = db.createUser(email, salt, Auth.hash(password, salt));
        if (id == null) {
            send(ex, 409, "{\"error\":\"An account with this email already exists. Log in instead.\"}");
            return;
        }
        startSession(ex, id, 201);
    }

    private void login(HttpExchange ex) throws IOException, SQLException {
        Map<String, String> f = params(body(ex));
        String email = f.getOrDefault("email", "").trim().toLowerCase();
        String password = f.getOrDefault("password", "");
        long now = System.currentTimeMillis();
        long[] state;
        synchronized (failures) {
            if (failures.size() > 10_000) failures.clear();
            state = failures.computeIfAbsent(email, k -> new long[2]);
            if (state[1] > now) {
                send(ex, 429, "{\"error\":\"Too many attempts. Wait a few minutes and try again.\"}");
                return;
            }
        }
        Database.User user = email.length() > 254 || password.length() > 128 ? null : db.findUser(email);
        boolean ok = false;
        if (user != null) {
            ok = Auth.verify(password, user.salt(), user.hash());
        } else {
            Auth.verify(password, dummySalt, dummyHash);
        }
        synchronized (failures) {
            if (!ok) {
                state[0]++;
                if (state[0] >= MAX_FAILURES) {
                    state[0] = 0;
                    state[1] = now + LOCK_MILLIS;
                }
            } else {
                failures.remove(email);
            }
        }
        if (!ok) {
            send(ex, 401, "{\"error\":\"Email or password is incorrect.\"}");
            return;
        }
        startSession(ex, user.id(), 200);
    }

    private void startSession(HttpExchange ex, int userId, int status) throws IOException, SQLException {
        String token = Auth.newToken();
        long expires = System.currentTimeMillis() + SESSION_MILLIS;
        db.createSession(userId, Auth.sha256(token), expires);
        send(ex, status, "{\"email\":" + quote(db.email(userId)) + "}",
                COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + (SESSION_MILLIS / 1000));
    }

    private static String clearCookie() {
        return COOKIE + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
    }

    private static String sessionToken(HttpExchange ex) {
        String header = ex.getRequestHeaders().getFirst("Cookie");
        if (header == null) return null;
        for (String part : header.split(";")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length == 2 && kv[0].equals(COOKIE) && !kv[1].isEmpty()) return kv[1];
        }
        return null;
    }

    private void staticFile(HttpExchange ex) throws IOException {
        if (!hostAllowed(ex) || !ex.getRequestMethod().equals("GET")) {
            send(ex, 403, "{\"error\":\"forbidden\"}");
            return;
        }
        String path = ex.getRequestURI().getPath();
        String page = PAGES.get(path);
        Path file = webRoot.resolve(page != null ? page : path.substring(1)).normalize();
        if (!file.startsWith(webRoot) || !Files.isRegularFile(file)) {
            send(ex, 404, "{\"error\":\"not found\"}");
            return;
        }
        String name = file.getFileName().toString();
        byte[] bytes = Files.readAllBytes(file);
        ex.getResponseHeaders().set("Content-Type", TYPES.getOrDefault(name.substring(name.lastIndexOf('.') + 1), "application/octet-stream"));
        ex.getResponseHeaders().set("Cache-Control", "no-cache");
        ex.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        ex.sendResponseHeaders(200, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }

    private boolean hostAllowed(HttpExchange ex) {
        String host = ex.getRequestHeaders().getFirst("Host");
        return host != null && (host.equals("localhost:" + port) || host.equals("127.0.0.1:" + port));
    }

    private static String body(HttpExchange ex) throws IOException {
        return new String(ex.getRequestBody().readNBytes(64 * 1024), StandardCharsets.UTF_8);
    }

    private static String text(Map<String, String> f, String key, int max) {
        String v = f.getOrDefault(key, "").trim();
        if (key.equals("category") && v.isEmpty()) throw new IllegalArgumentException("category is required");
        if (v.length() > max) throw new IllegalArgumentException(key + " is too long");
        return v;
    }

    private static Map<String, String> params(String s) {
        Map<String, String> m = new HashMap<>();
        if (s == null) return m;
        for (String pair : s.split("&")) {
            if (pair.isEmpty()) continue;
            String[] kv = pair.split("=", 2);
            m.put(URLDecoder.decode(kv[0], StandardCharsets.UTF_8),
                    kv.length > 1 ? URLDecoder.decode(kv[1], StandardCharsets.UTF_8) : "");
        }
        return m;
    }

    private static String json(Transaction t) {
        return "{\"id\":" + t.getId() + ",\"type\":" + quote(t.getType()) + ",\"category\":" + quote(t.getCategory())
                + ",\"amount\":" + t.getAmount() + ",\"date\":" + quote(t.getDate())
                + ",\"description\":" + quote(t.getDescription()) + "}";
    }

    private static String quote(String s) {
        if (s == null) s = "";
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '\\' -> sb.append("\\\\");
                case '"' -> sb.append("\\\"");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> sb.append(c < 0x20 ? String.format("\\u%04x", (int) c) : String.valueOf(c));
            }
        }
        return sb.append("\"").toString();
    }

    private static void send(HttpExchange ex, int status, String body) throws IOException {
        send(ex, status, body, null);
    }

    private static void send(HttpExchange ex, int status, String body, String setCookie) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        if (setCookie != null) ex.getResponseHeaders().add("Set-Cookie", setCookie);
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }
}
