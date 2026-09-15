import re

with open('src/pages/ClientPanel.tsx', 'r') as f:
    content = f.read()

content = content.replace("setLoadingDetails(true);", "if (!clientData) setLoadingDetails(true);")

with open('src/pages/ClientPanel.tsx', 'w') as f:
    f.write(content)
