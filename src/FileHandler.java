import java.io.*;
import java.util.ArrayList;

public class FileHandler {

    // Saves all transactions to a CSV file
    public void saveToFile(ArrayList<Transaction> transactions, String filename) {
        try (BufferedWriter writer = new BufferedWriter(new FileWriter(filename))) {
            for (Transaction t : transactions) {
                // Formats each transaction as: id,type,category,amount
                String line = t.getId() + "," +
                              t.getType() + "," +
                              t.getCategory().replace(",", " ") + "," +
                              t.getAmount();
                writer.write(line);
                writer.newLine();
            }
            System.out.println("Data saved successfully to " + filename);
        } catch (IOException e) {
            System.out.println("Error saving data: " + e.getMessage());
        }
    }

    // Loads transactions from the CSV file when the app starts
    public ArrayList<Transaction> loadFromFile(String filename) {
        ArrayList<Transaction> transactions = new ArrayList<>();
        File file = new File(filename);

        // If the file doesn't exist yet (first time running), return an empty list
        if (!file.exists()) {
            return transactions;
        }

        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.trim().isEmpty()) continue;

                String[] parts = line.split(",");
                if (parts.length == 4) {
                    int id = Integer.parseInt(parts[0].trim());
                    String type = parts[1].trim();
                    String category = parts[2].trim();
                    double amount = Double.parseDouble(parts[3].trim());

                    // Matches Member 2's Transaction constructor
                    transactions.add(new Transaction(id, type, category, amount));
                }
            }
            System.out.println("Loaded " + transactions.size() + " previous transactions.");
        } catch (IOException | NumberFormatException e) {
            System.out.println("Error loading data: " + e.getMessage());
        }

        return transactions;
    }
}