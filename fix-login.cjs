const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

if (!content.includes('useAuth')) {
  content = content.replace(
    `import { supabase } from '../lib/supabase';`,
    `import { supabase } from '../lib/supabase';\nimport { useAuth } from '../contexts/AuthContext';`
  );
  
  content = content.replace(
    `  const [loading, setLoading] = useState(false);\n  const navigate = useNavigate();`,
    `  const [loading, setLoading] = useState(false);\n  const navigate = useNavigate();\n  const { userProfile, loading: authLoading } = useAuth();\n\n  React.useEffect(() => {\n    if (userProfile && !authLoading) {\n      navigate('/');\n    }\n  }, [userProfile, authLoading, navigate]);`
  );
  fs.writeFileSync('src/pages/Login.tsx', content);
  console.log('Added useAuth redirect to Login.tsx');
} else {
  console.log('Already has useAuth');
}
