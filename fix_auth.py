import re

with open('src/contexts/AuthContext.tsx', 'r') as f:
    content = f.read()

old_code = "setUserProfile(mappedProfile);"
new_code = """
        setUserProfile((prev: UserProfile | null) => {
          if (!prev) return mappedProfile;
          const prevStr = JSON.stringify(prev);
          const newStr = JSON.stringify(mappedProfile);
          return prevStr === newStr ? prev : mappedProfile;
        });
"""

content = content.replace(old_code, new_code)

with open('src/contexts/AuthContext.tsx', 'w') as f:
    f.write(content)
