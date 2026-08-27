const fs = require('fs');

let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

// Update Sidebar Header
const sidebarHeaderTarget = `{/* Header */}
        <div className="flex items-center justify-between h-16 px-6 bg-primary shadow-md shrink-0">
          <div className="flex items-center space-x-2">
            {userProfile?.whatsappSettings?.companyLogo && <img key={userProfile.whatsappSettings.companyLogo} src={userProfile.whatsappSettings.companyLogo} alt="Logo" className="w-8 h-8 object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
            <span className="text-2xl font-bold text-secondary-light tracking-wide truncate max-w-[180px]">{userProfile?.whatsappSettings?.companyName || "GestãoPro"}</span>
          </div>
          <button onClick={() => setIsDrawerOpen(false)} className="lg:hidden text-white hover:text-gray-200 transition-colors">
            <X size={24} />
          </button>
        </div>`;

const sidebarHeaderReplacement = `{/* Header */}
        <div className="flex flex-col bg-primary shadow-md shrink-0">
          <div className="flex items-center justify-between h-16 px-6">
            <span className="text-2xl font-bold text-secondary-light tracking-wide truncate max-w-[200px]">{userProfile?.whatsappSettings?.companyName || "GestãoPro"}</span>
            <button onClick={() => setIsDrawerOpen(false)} className="lg:hidden text-white hover:text-gray-200 transition-colors">
              <X size={24} />
            </button>
          </div>
          {userProfile?.whatsappSettings?.companyLogo && (
            <div className="w-full aspect-square bg-white flex items-center justify-center p-2 border-b border-gray-200">
              <img 
                key={userProfile.whatsappSettings.companyLogo} 
                src={userProfile.whatsappSettings.companyLogo} 
                alt="Logo" 
                className="w-full h-full object-contain" 
                onError={(e) => { e.currentTarget.style.display = "none"; }} 
              />
            </div>
          )}
        </div>`;

if(code.includes(sidebarHeaderTarget)) {
  code = code.replace(sidebarHeaderTarget, sidebarHeaderReplacement);
} else {
  console.error("Sidebar header target not found.");
}

// Update Mobile Header
const mobileHeaderTarget = `<div className="flex items-center space-x-2 ml-2">
            {userProfile?.whatsappSettings?.companyLogo && <img key={userProfile.whatsappSettings.companyLogo} src={userProfile.whatsappSettings.companyLogo} alt="Logo" className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
            <span className="text-lg font-bold text-primary truncate max-w-[150px]">{userProfile?.whatsappSettings?.companyName || "GestãoPro"}</span>
          </div>`;

const mobileHeaderReplacement = `<div className="flex items-center space-x-2 ml-2">
            <span className="text-lg font-bold text-primary truncate max-w-[150px]">{userProfile?.whatsappSettings?.companyName || "GestãoPro"}</span>
          </div>`;

if(code.includes(mobileHeaderTarget)) {
  code = code.replace(mobileHeaderTarget, mobileHeaderReplacement);
} else {
  console.error("Mobile header target not found.");
}

fs.writeFileSync('src/components/Layout.tsx', code);
console.log("Layout.tsx patched.");
