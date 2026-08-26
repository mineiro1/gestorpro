const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

code = code.replace(
  '<img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" onError={(e) => { e.currentTarget.style.display = \'none\'; }} />\n            <span className="text-2xl font-bold text-secondary-light tracking-wide">GestãoPro</span>',
  '<img src={userProfile?.whatsappSettings?.companyLogo || "/logo.png"} alt="Logo" className="w-8 h-8 object-contain" onError={(e) => { e.currentTarget.src = "/logo.png"; }} />\n            <span className="text-2xl font-bold text-secondary-light tracking-wide truncate max-w-[180px]">{userProfile?.whatsappSettings?.companyName || "GestãoPro"}</span>'
);

code = code.replace(
  '<img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = \'none\'; }} />\n            <span className="text-lg font-bold text-primary">GestãoPro</span>',
  '<img src={userProfile?.whatsappSettings?.companyLogo || "/logo.png"} alt="Logo" className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.src = "/logo.png"; }} />\n            <span className="text-lg font-bold text-primary truncate max-w-[150px]">{userProfile?.whatsappSettings?.companyName || "GestãoPro"}</span>'
);

fs.writeFileSync('src/components/Layout.tsx', code);
console.log("Layout logo patched.");
