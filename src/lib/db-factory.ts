import type { DatabaseInterface } from "./db-interface";

let _instance: DatabaseInterface | null = null;

function getInstance(): DatabaseInterface {
  if (!_instance) {
    const provider = process.env.DATABASE_PROVIDER || "sqlite";
    if (provider === "supabase") {
      const { db } = require("./db-supabase");
      _instance = db;
    } else {
      const { db } = require("./db");
      _instance = db;
    }
  }
  return _instance!;
}

export const db: DatabaseInterface = new Proxy({} as DatabaseInterface, {
  get(_target, prop) {
    return (getInstance() as any)[prop];
  },
});
