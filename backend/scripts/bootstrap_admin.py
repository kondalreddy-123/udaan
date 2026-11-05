#!/usr/bin/env python3
"""
UDAAN - Initial Administrator Setup CLI Script.
Safely provisions the first administrator account with Argon2id password hashing.

Usage:
  python backend/scripts/bootstrap_admin.py --email admin@udaan.edu --password SecurePassword123 --name "UDAAN Admin"
"""

import sys
import os
import argparse

# Ensure backend root is in python path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from app.database import SessionLocal, init_db_schema
from app.models import User
from app.auth import hash_password


def bootstrap_admin(email: str, password: str, full_name: str, force: bool = False):
    init_db_schema()
    db = SessionLocal()
    try:
        normalized_email = email.strip().lower()
        existing_admin = db.query(User).filter(User.role == "admin", User.is_active == True).first()

        if existing_admin and not force:
            print(f"[!] Warning: An active administrator already exists ({existing_admin.email}).")
            confirm = input("Do you wish to create/update another administrator? (y/N): ").strip().lower()
            if confirm != "y":
                print("[-] Bootstrap aborted.")
                return

        user = db.query(User).filter(User.email == normalized_email).first()
        hashed = hash_password(password)

        if user:
            user.role = "admin"
            user.full_name = full_name
            user.hashed_password = hashed
            user.is_active = True
            print(f"[+] Existing user '{normalized_email}' promoted to Administrator with Argon2id credentials.")
        else:
            user = User(
                email=normalized_email,
                hashed_password=hashed,
                full_name=full_name,
                role="admin",
                class_name="Administration",
                grade=8,
                is_active=True,
                created_by="cli_bootstrap"
            )
            db.add(user)
            print(f"[+] Administrator account '{normalized_email}' created successfully.")

        db.commit()
        db.refresh(user)
        print(f"[OK] Administrator bootstrap complete: ID={user.id}, Email={user.email}, Role={user.role}")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bootstrap UDAAN Administrator Account")
    parser.add_argument("--email", default="admin@udaan.edu", help="Admin email address")
    parser.add_argument("--password", default="udaanAdmin2026!", help="Admin password (min 6 chars)")
    parser.add_argument("--name", default="UDAAN Admin", help="Full name of administrator")
    parser.add_argument("--force", action="store_true", help="Skip confirmation if admin exists")

    args = parser.parse_args()
    if len(args.password) < 6:
        print("[!] Error: Password must be at least 6 characters.")
        sys.exit(1)

    bootstrap_admin(email=args.email, password=args.password, full_name=args.name, force=args.force)
