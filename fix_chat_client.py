import re

with open('src/components/ChatModal.tsx', 'r') as f:
    content = f.read()

# Replace .eq('visit_id', visit.id) with .eq('client_id', client.id) for session lookup
content = content.replace(".eq('visit_id', visit.id)", ".eq('client_id', client.id)")

# Replace the create session visit_id: visit.id with visit_id: null
content = re.sub(r'visit_id:\s*visit\.id', 'visit_id: visit ? visit.id : null', content)

with open('src/components/ChatModal.tsx', 'w') as f:
    f.write(content)
