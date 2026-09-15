import re

def update_file(filename):
    with open(filename, 'r') as f:
        content = f.read()
        
    old_import = "import { openWhatsApp } from '../lib/whatsapp';"
    new_import = "import { openWhatsApp, sendMetaMessage, sendEvolutionMessage } from '../lib/whatsapp';"
    
    if old_import in content:
        content = content.replace(old_import, new_import)
        with open(filename, 'w') as f:
            f.write(content)
            print(f"Fixed imports in {filename}")

update_file('src/pages/Billing.tsx')
update_file('src/pages/Messages.tsx')
