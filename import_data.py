#!/usr/bin/env python3
import sys
from sqlalchemy import create_engine, text

# Database connection
DATABASE_URL = "postgresql+psycopg2://postgres:Admin@123@postgres:5432/sqlagent"
engine = create_engine(DATABASE_URL)

# Read SQL file
with open('data.sql', 'r') as f:
    sql_content = f.read()

# Split by statements and execute
statements = [stmt.strip() for stmt in sql_content.split(';') if stmt.strip()]

with engine.begin() as conn:
    for statement in statements:
        if statement:
            conn.execute(text(statement))

print("Data imported successfully!")