# -*- coding: utf-8 -*-
import sys
import os
import sqlite3
import json

DATABASE_PATH = os.path.join(os.getcwd(), "database.db")

def main():
    try:
        # Read from stdin
        line = sys.stdin.read().strip()
        if not line:
            print(json.dumps({"success": False, "error": "No input received"}))
            return

        data = json.loads(line)
        action = data.get("action")
        query = data.get("query")
        params = data.get("params", [])

        # Ensure database directory exists
        db_dir = os.path.dirname(DATABASE_PATH)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)

        conn = sqlite3.connect(DATABASE_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        if action == "run":
            cursor.execute(query, params)
            conn.commit()
            last_id = cursor.lastrowid
            changes = conn.total_changes
            print(json.dumps({"success": True, "result": {"id": last_id, "changes": changes}}))
        elif action == "get":
            cursor.execute(query, params)
            row = cursor.fetchone()
            if row:
                print(json.dumps({"success": True, "result": dict(row)}))
            else:
                print(json.dumps({"success": True, "result": None}))
        elif action == "all":
            cursor.execute(query, params)
            rows = cursor.fetchall()
            result = [dict(r) for r in rows]
            print(json.dumps({"success": True, "result": result}))
        else:
            print(json.dumps({"success": False, "error": f"Unknown action: {action}"}))

        conn.close()
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    main()
