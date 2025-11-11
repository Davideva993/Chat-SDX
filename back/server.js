import "dotenv/config";
import { createServer } from "http";
import { initDb } from "./models/db.js";

const port = Number(process.env.PORT || 3001);

async function startServer() {
  try {
    await initDb();
    console.log("Database synced");
    const { default: app } = await import("./app.js");
    const server = createServer(app);
    server.listen(port, ()=> console.log(`Listening on ${port}`));
  } catch (e) {
    console.error("Startup error:", e);
    process.exit(1);
  }
}

startServer();