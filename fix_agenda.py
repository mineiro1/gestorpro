import re

with open('src/pages/Agenda.tsx', 'r') as f:
    content = f.read()

content = content.replace("      setLoading(true);", "      if (contacts.length === 0) setLoading(true);")

with open('src/pages/Agenda.tsx', 'w') as f:
    f.write(content)
