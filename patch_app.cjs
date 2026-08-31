const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

const rootRouteCode = `const RootRoute = () => {
  const { currentUser, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50/80 backdrop-blur-sm">
        <div className="flex flex-col items-center space-y-6">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-xl ring-8 ring-blue-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          </div>
        </div>
      </div>
    );
  }
  
  if (Capacitor.isNativePlatform()) {
    return currentUser ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />;
  }
  
  return <Landing />;
};`;

if (!code.includes('const RootRoute')) {
  code = code.replace('export default function App() {', rootRouteCode + '\n\nexport default function App() {');
}

const targetRoute = `<Route path="/" element={Capacitor.isNativePlatform() ? <Navigate to="/login" replace /> : <Landing />} />`;
const replacementRoute = `<Route path="/" element={<RootRoute />} />`;

code = code.replace(targetRoute, replacementRoute);
fs.writeFileSync('src/App.tsx', code);
