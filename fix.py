import re

with open('src/pages/ProductsPage.tsx', 'r') as f:
    content = f.read()

content = content.replace(").join('\\n') +", ").join('\\n') +")

with open('src/pages/ProductsPage.tsx', 'w') as f:
    f.write(content)
