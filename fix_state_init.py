import re

with open('src/pages/Billing.tsx', 'r') as f:
    content = f.read()

old_init = """    useMetaApi: false,
    metaToken: '',
    metaPhoneNumberId: ''
  });"""

new_init = """    useMetaApi: false,
    metaToken: '',
    metaPhoneNumberId: '',
    metaServerUrl: ''
  });"""

content = content.replace(old_init, new_init)

with open('src/pages/Billing.tsx', 'w') as f:
    f.write(content)
