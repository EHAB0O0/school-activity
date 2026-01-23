
path = r"f:\مدرسه\ثاني ثانوي\نشاط\School Activity Management\src\pages\SettingsPage.jsx"
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Keep only the first 1002 lines
new_lines = lines[:1002]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Truncated file to {len(new_lines)} lines.")
