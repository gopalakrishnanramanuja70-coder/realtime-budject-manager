public class Transaction {
    private int id;
    private String type;        // "INCOME" or "EXPENSE"
    private String category;    // e.g., "Food", "Salary", "Travel"
    private double amount;
    private String date;        // e.g., "2026-11-20"
    private String description;

    // 6-argument constructor
    public Transaction(int id, String type, String category, double amount, String date, String description) {
        this.id = id;
        setType(type);
        this.category = category;
        setAmount(amount);
        this.date = date;
        this.description = description;
    }

    // 5-argument overloaded constructor (defaults description to "")
    public Transaction(int id, String type, String category, double amount, String date) {
        this(id, type, category, amount, date, "");
    }

    // Getters
    public int getId() {
        return id;
    }

    public String getType() {
        return type;
    }

    public String getCategory() {
        return category;
    }

    public double getAmount() {
        return amount;
    }

    public String getDate() {
        return date;
    }

    public String getDescription() {
        return description;
    }

    // Setters
    public void setId(int id) {
        this.id = id;
    }

    public void setType(String type) {
        if (type == null || type.trim().isEmpty()) {
            this.type = "EXPENSE";
            return;
        }
        String normalized = type.trim().toUpperCase();
        if (!normalized.equals("INCOME") && !normalized.equals("EXPENSE")) {
            throw new IllegalArgumentException("Type must be INCOME or EXPENSE");
        }
        this.type = normalized;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public void setAmount(double amount) {
        if (amount < 0) {
            throw new IllegalArgumentException("Amount cannot be negative");
        }
        this.amount = amount;
    }

    public void setDate(String date) {
        this.date = date;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    // Serialize to a CSV row for FileHandler
    public String toCSV() {
        String safeCategory = category == null ? "" : category.replace(",", " ").trim();
        String safeDate = date == null ? "" : date.replace(",", " ").trim();
        String safeDesc = description == null ? "" : description.replace(",", " ").trim();
        return id + "," + type + "," + safeCategory + "," + amount + "," + safeDate + "," + safeDesc;
    }

    // Deserialize a CSV row back into a Transaction object
    public static Transaction fromCSV(String csvLine) {
        if (csvLine == null || csvLine.trim().isEmpty()) {
            throw new IllegalArgumentException("CSV line is empty");
        }
        String[] parts = csvLine.split(",", 6);
        if (parts.length < 5) {
            throw new IllegalArgumentException("Invalid CSV row: " + csvLine);
        }
        int id = Integer.parseInt(parts[0].trim());
        String type = parts[1].trim();
        String category = parts[2].trim();
        double amount = Double.parseDouble(parts[3].trim());
        String date = parts[4].trim();
        String description = parts.length == 6 ? parts[5].trim() : "";
        return new Transaction(id, type, category, amount, date, description);
    }

    @Override
    public String toString() {
        return String.format("ID: %-3d | %-7s | %-12s | ₹%-8.2f | %-10s | %s",
                id, type, category, amount, date, description);
    }
}