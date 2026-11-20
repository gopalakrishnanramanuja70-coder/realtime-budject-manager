import java.util.ArrayList;

public class BudgetManager {
    private ArrayList<Transaction> transactions;
    private int nextId;

    public BudgetManager() {
        this.transactions = new ArrayList<>();
        this.nextId = 1;
    }

    public void setTransactions(ArrayList<Transaction> loadedList) {
        if (loadedList != null) {
            this.transactions = loadedList;
            for (Transaction t : transactions) {
                if (t.getId() >= nextId) {
                    nextId = t.getId() + 1;
                }
            }
        }
    }

    public void addTransaction(String type, String category, double amount, String description) {
        if (amount <= 0) {
            System.out.println("Error: Amount must be greater than zero.");
            return;
        }
        Transaction t = new Transaction(nextId++, type.toUpperCase(), category, amount,
                java.time.LocalDate.now().toString(), description);
        transactions.add(t);
        System.out.println("Transaction added successfully! (ID: " + t.getId() + ")");
    }

    public ArrayList<Transaction> getAllTransactions() {
        return transactions;
    }

    public void displayAllTransactions() {
        if (transactions.isEmpty()) {
            System.out.println("No transactions recorded yet.");
            return;
        }
        System.out.println("\n--- All Transactions ---");
        System.out.printf("%-5s | %-10s | %-15s | %-10s | %-20s%n", "ID", "Type", "Category", "Amount", "Description");
        System.out.println("---------------------------------------------------------------------");
        for (Transaction t : transactions) {
            System.out.printf("%-5d | %-10s | %-15s | %-10.2f | %-20s%n",
                    t.getId(), t.getType(), t.getCategory(), t.getAmount(), t.getDescription());
        }
    }

    public boolean deleteTransaction(int id) {
        for (int i = 0; i < transactions.size(); i++) {
            if (transactions.get(i).getId() == id) {
                transactions.remove(i);
                System.out.println("Transaction ID " + id + " deleted.");
                return true;
            }
        }
        System.out.println("Error: Transaction ID " + id + " not found.");
        return false;
    }
}