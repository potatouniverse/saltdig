import type { DatabaseInterface } from "./db-interface";

let _instance: DatabaseInterface | null = null;

function getInstance(): DatabaseInterface {
  if (!_instance) {
    // saltdig is Supabase-only
    const { db } = require("./db-supabase");
    _instance = db;
  }
  return _instance!;
}

export const db: DatabaseInterface = new Proxy({} as DatabaseInterface, {
  get(_target, prop) {
    return (getInstance() as any)[prop];
  },
});
