import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

public class ReportGenerator {

    // 1. Overall Income, Expense, Net Balance & Budget Alert
    public void printSummary(ArrayList<Transaction> transactions, double monthlyBudgetLimit) {
        if (transactions == null || transactions.isEmpty()) {
            System.out.println("\n[Report] No transactions recorded yet.");
            return;
        }

        double totalIncome = 0.0;
        double totalExpense = 0.0;

        for (Transaction t : transactions) {
            if ("INCOME".equalsIgnoreCase(t.getType())) {
                totalIncome += t.getAmount();
            } else if ("EXPENSE".equalsIgnoreCase(t.getType())) {
                totalExpense += t.getAmount();
            }
        }

        double balance = totalIncome - totalExpense;

        System.out.println("\n================ BUDGET SUMMARY ================");
        System.out.printf("Total Income   : Rs. %.2f%n", totalIncome);
        System.out.printf("Total Expenses : Rs. %.2f%n", totalExpense);
        System.out.printf("Net Balance    : Rs. %.2f%n", balance);
        System.out.println("------------------------------------------------");

        if (monthlyBudgetLimit > 0 && totalExpense > monthlyBudgetLimit) {
            System.out.printf("ALERT: Exceeded budget limit of Rs. %.2f by Rs. %.2f!%n",
                    monthlyBudgetLimit, (totalExpense - monthlyBudgetLimit));
        } else if (balance < 0) {
            System.out.println("WARNING: Your expenses are higher than your income!");
        } else {
            System.out.println("STATUS: Spending is within safe limits.");
        }
        System.out.println("================================================\n");
    }

    // 2. Category-Wise Expense Breakdown
    public void printCategoryBreakdown(ArrayList<Transaction> transactions) {
        if (transactions == null || transactions.isEmpty()) {
            System.out.println("\n[Report] No transactions available for breakdown.");
            return;
        }

        HashMap<String, Double> categoryMap = new HashMap<>();
        double totalExpense = 0.0;

        for (Transaction t : transactions) {
            if ("EXPENSE".equalsIgnoreCase(t.getType())) {
                String rawCat = t.getCategory();
                String cat = (rawCat == null || rawCat.trim().isEmpty())
                        ? "UNCATEGORIZED"
                        : rawCat.trim().toUpperCase();

                categoryMap.put(cat, categoryMap.getOrDefault(cat, 0.0) + t.getAmount());
                totalExpense += t.getAmount();
            }
        }

        if (categoryMap.isEmpty()) {
            System.out.println("\n[Report] No expenses recorded yet.");
            return;
        }

        System.out.println("\n=========== EXPENSE BY CATEGORY ===========");
        for (Map.Entry<String, Double> entry : categoryMap.entrySet()) {
            double amount = entry.getValue();
            double percentage = (amount / totalExpense) * 100;
            System.out.printf("%-15s : Rs. %-10.2f (%.1f%%)%n", entry.getKey(), amount, percentage);
        }
        System.out.println("===========================================\n");
    }
}