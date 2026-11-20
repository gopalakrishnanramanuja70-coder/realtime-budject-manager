import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public class Database {
    record User(int id, byte[] salt, byte[] hash) {
    }

    private final Connection conn;

    public Database(String path) throws SQLException {
        conn = DriverManager.getConnection("jdbc:sqlite:" + path);
        try (Statement st = conn.createStatement()) {
            st.execute("PRAGMA journal_mode=WAL");
            st.execute("PRAGMA foreign_keys=ON");
            Set<String> budgetCols = columns("budgets");
            if (!budgetCols.isEmpty() && !budgetCols.contains("user_id")) {
                st.execute("ALTER TABLE budgets RENAME TO budgets_legacy");
            }
            st.execute("CREATE TABLE IF NOT EXISTS users ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    + "email TEXT NOT NULL UNIQUE,"
                    + "salt BLOB NOT NULL,"
                    + "hash BLOB NOT NULL,"
                    + "created TEXT NOT NULL DEFAULT (datetime('now')))");
            st.execute("CREATE TABLE IF NOT EXISTS sessions ("
                    + "token_hash TEXT PRIMARY KEY,"
                    + "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
                    + "expires INTEGER NOT NULL)");
            st.execute("CREATE TABLE IF NOT EXISTS transactions ("
                    + "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    + "user_id INTEGER NOT NULL DEFAULT 0,"
                    + "type TEXT NOT NULL CHECK(type IN ('INCOME','EXPENSE')),"
                    + "category TEXT NOT NULL,"
                    + "amount REAL NOT NULL CHECK(amount > 0),"
                    + "date TEXT NOT NULL,"
                    + "description TEXT NOT NULL DEFAULT '',"
                    + "sample INTEGER NOT NULL DEFAULT 0)");
            if (!columns("transactions").contains("user_id")) {
                st.execute("ALTER TABLE transactions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0");
            }
            st.execute("CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, date)");
            boolean migrateBudgets = columns("budgets").isEmpty();
            st.execute("CREATE TABLE IF NOT EXISTS budgets ("
                    + "user_id INTEGER NOT NULL,"
                    + "category TEXT NOT NULL,"
                    + "monthly_limit REAL NOT NULL CHECK(monthly_limit > 0),"
                    + "PRIMARY KEY (user_id, category))");
            if (migrateBudgets && !columns("budgets_legacy").isEmpty()) {
                st.execute("INSERT INTO budgets(user_id, category, monthly_limit) SELECT 0, category, monthly_limit FROM budgets_legacy");
            }
        }
    }

    private Set<String> columns(String table) throws SQLException {
        Set<String> out = new HashSet<>();
        try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery("PRAGMA table_info(" + table + ")")) {
            while (rs.next()) out.add(rs.getString("name"));
        }
        return out;
    }

    public synchronized int userCount() throws SQLException {
        try (Statement st = conn.createStatement(); ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM users")) {
            rs.next();
            return rs.getInt(1);
        }
    }

    public synchronized boolean hasUnclaimedData() throws SQLException {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT (SELECT COUNT(*) FROM transactions WHERE user_id = 0) + (SELECT COUNT(*) FROM budgets WHERE user_id = 0)")) {
            rs.next();
            return rs.getInt(1) > 0;
        }
    }

    public synchronized Integer createUser(String email, byte[] salt, byte[] hash) throws SQLException {
        boolean first = userCount() == 0;
        try (PreparedStatement ps = conn.prepareStatement("INSERT INTO users(email, salt, hash) VALUES (?,?,?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, email);
            ps.setBytes(2, salt);
            ps.setBytes(3, hash);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                keys.next();
                int id = keys.getInt(1);
                if (first) claimLegacyData(id);
                return id;
            }
        } catch (SQLException e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE")) return null;
            throw e;
        }
    }

    private void claimLegacyData(int userId) throws SQLException {
        try (PreparedStatement a = conn.prepareStatement("UPDATE transactions SET user_id = ? WHERE user_id = 0");
             PreparedStatement b = conn.prepareStatement("UPDATE budgets SET user_id = ? WHERE user_id = 0")) {
            a.setInt(1, userId);
            a.executeUpdate();
            b.setInt(1, userId);
            b.executeUpdate();
        }
    }

    public synchronized User findUser(String email) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT id, salt, hash FROM users WHERE email = ?")) {
            ps.setString(1, email);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? new User(rs.getInt(1), rs.getBytes(2), rs.getBytes(3)) : null;
            }
        }
    }

    public synchronized String email(int userId) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT email FROM users WHERE id = ?")) {
            ps.setInt(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getString(1) : null;
            }
        }
    }

    public synchronized void createSession(int userId, String tokenHash, long expiresMillis) throws SQLException {
        try (PreparedStatement purge = conn.prepareStatement("DELETE FROM sessions WHERE expires < ?");
             PreparedStatement ps = conn.prepareStatement("INSERT INTO sessions(token_hash, user_id, expires) VALUES (?,?,?)")) {
            purge.setLong(1, System.currentTimeMillis());
            purge.executeUpdate();
            ps.setString(1, tokenHash);
            ps.setInt(2, userId);
            ps.setLong(3, expiresMillis);
            ps.executeUpdate();
        }
    }

    public synchronized Integer sessionUser(String tokenHash) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("SELECT user_id FROM sessions WHERE token_hash = ? AND expires > ?")) {
            ps.setString(1, tokenHash);
            ps.setLong(2, System.currentTimeMillis());
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : null;
            }
        }
    }

    public synchronized void deleteSession(String tokenHash) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM sessions WHERE token_hash = ?")) {
            ps.setString(1, tokenHash);
            ps.executeUpdate();
        }
    }

    public synchronized ArrayList<Transaction> list(int userId, String month) throws SQLException {
        String sql = "SELECT id, type, category, amount, date, description FROM transactions WHERE user_id = ?"
                + (month == null ? "" : " AND substr(date, 1, 7) = ?")
                + " ORDER BY date DESC, id DESC";
        ArrayList<Transaction> out = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setInt(1, userId);
            if (month != null) ps.setString(2, month);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(new Transaction(rs.getInt(1), rs.getString(2), rs.getString(3),
                            rs.getDouble(4), rs.getString(5), rs.getString(6)));
                }
            }
        }
        return out;
    }

    public synchronized Transaction add(int userId, Integer id, String type, String category, double amount,
                                        String date, String description, boolean sample) throws SQLException {
        LocalDate.parse(date);
        Transaction checked = new Transaction(0, type, category, amount, date, description);
        if (amount <= 0) throw new IllegalArgumentException("Amount must be greater than zero");
        String sql = id == null
                ? "INSERT INTO transactions(user_id, type, category, amount, date, description, sample) VALUES (?,?,?,?,?,?,?)"
                : "INSERT INTO transactions(user_id, type, category, amount, date, description, sample, id) VALUES (?,?,?,?,?,?,?,?)";
        try (PreparedStatement ps = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.setInt(1, userId);
            ps.setString(2, checked.getType());
            ps.setString(3, category);
            ps.setDouble(4, amount);
            ps.setString(5, date);
            ps.setString(6, description);
            ps.setInt(7, sample ? 1 : 0);
            if (id != null) ps.setInt(8, id);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                keys.next();
                checked.setId(keys.getInt(1));
            }
        }
        return checked;
    }

    public synchronized boolean delete(int userId, int id) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM transactions WHERE id = ? AND user_id = ?")) {
            ps.setInt(1, id);
            ps.setInt(2, userId);
            return ps.executeUpdate() > 0;
        }
    }

    public synchronized int deleteSamples(int userId) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement("DELETE FROM transactions WHERE sample = 1 AND user_id = ?")) {
            ps.setInt(1, userId);
            return ps.executeUpdate();
        }
    }

    public synchronized Map<String, Double> budgets(int userId) throws SQLException {
        Map<String, Double> out = new LinkedHashMap<>();
        try (PreparedStatement ps = conn.prepareStatement("SELECT category, monthly_limit FROM budgets WHERE user_id = ? ORDER BY category")) {
            ps.setInt(1, userId);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) out.put(rs.getString(1), rs.getDouble(2));
            }
        }
        return out;
    }

    public synchronized void setBudget(int userId, String category, double limit) throws SQLException {
        if (limit <= 0) {
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM budgets WHERE user_id = ? AND category = ?")) {
                ps.setInt(1, userId);
                ps.setString(2, category);
                ps.executeUpdate();
            }
            return;
        }
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT INTO budgets(user_id, category, monthly_limit) VALUES (?, ?, ?) "
                        + "ON CONFLICT(user_id, category) DO UPDATE SET monthly_limit = excluded.monthly_limit")) {
            ps.setInt(1, userId);
            ps.setString(2, category);
            ps.setDouble(3, limit);
            ps.executeUpdate();
        }
    }
}
