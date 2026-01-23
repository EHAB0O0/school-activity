
import os

file_path = "src/pages/SettingsPage.jsx"
print(f"Current working directory: {os.getcwd()}")
print(f"Target file: {file_path}")

if not os.path.exists(file_path):
    print("Error: File not found!")
    exit(1)

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Original line count: {len(lines)}")
print(f"Line 1002 content: {lines[1001] if len(lines) > 1001 else 'N/A'}")
print(f"Line 1003 content: {lines[1002] if len(lines) > 1002 else 'N/A'}")

# Keep only the first 1002 lines
new_lines = lines[:1002]

print(f"Truncating to {len(new_lines)} lines...")

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("File written.")

# Verify
with open(file_path, 'r', encoding='utf-8') as f:
    lines_after = f.readlines()
print(f"New line count: {len(lines_after)}")
