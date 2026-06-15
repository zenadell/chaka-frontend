import re

def replace_colors(file_path):
    with open(file_path, 'r') as f:
        content = f.read()

    # Replace #4fd1c5 with var(--accent)
    content = re.sub(r'#4fd1c5', 'var(--accent)', content, flags=re.IGNORECASE)
    # Replace #38b2ac with var(--accent)
    content = re.sub(r'#38b2ac', 'var(--accent)', content, flags=re.IGNORECASE)
    # Replace rgba(79, 209, 197, X) with rgba(249, 115, 22, X)
    content = re.sub(r'rgba\(\s*79\s*,\s*209\s*,\s*197\s*,([^)]+)\)', r'rgba(249, 115, 22,\1)', content)
    # Replace #1a4b46 (dark green bg) with rgba(249, 115, 22, 0.15)
    content = re.sub(r'#1a4b46', 'rgba(249, 115, 22, 0.15)', content, flags=re.IGNORECASE)
    # Replace #e6fffa (light green bg) with rgba(249, 115, 22, 0.1)
    content = re.sub(r'#e6fffa', 'rgba(249, 115, 22, 0.1)', content, flags=re.IGNORECASE)
    # Replace #319795 (light mode dark green text) with var(--accent)
    content = re.sub(r'#319795', 'var(--accent)', content, flags=re.IGNORECASE)

    with open(file_path, 'w') as f:
        f.write(content)

replace_colors('/Users/mac/Downloads/chaka-frontend-main-5/style31.css')
replace_colors('/Users/mac/Downloads/chaka-frontend-main-5/educationMode.css')
print("Colors replaced successfully.")
