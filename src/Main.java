import java.io.IOException;
import java.net.BindException;
import java.nio.file.Files;
import java.nio.file.Path;

public class Main {
    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8080;
        String dbFile = args.length > 1 ? args[1] : "expensify.db";
        if (dbFile.equals("expensify.db")) renameOldDatabase();
        try {
            new BudgetServer(new Database(dbFile), Path.of("web"), port).start();
        } catch (BindException e) {
            System.err.println("Port " + port + " is already in use. Stop the other program, or start Expensify on another port, for example: npm run dev -- 9090");
            System.exit(1);
        }
    }

    private static void renameOldDatabase() throws IOException {
        if (!Files.exists(Path.of("hisab.db")) || Files.exists(Path.of("expensify.db"))) return;
        for (String suffix : new String[] {"", "-wal", "-shm"}) {
            Path from = Path.of("hisab.db" + suffix);
            if (Files.exists(from)) Files.move(from, Path.of("expensify.db" + suffix));
        }
        System.out.println("The app was renamed from Hisab to Expensify, so hisab.db is now expensify.db. Your data is unchanged.");
    }
}
