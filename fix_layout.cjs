const fs = require('fs');
let code = fs.readFileSync('src/components/Layout.tsx', 'utf-8');

// The banner hides itself if it thinks permissions are already granted or if dismissed
// We need to make sure the token is always updated. 
// Also userProfile.uid should be userProfile.id
code = code.replace("userProfile && userProfile.uid", "userProfile && userProfile.id");
code = code.replace(".eq('id', userProfile.uid)", ".eq('id', userProfile.id)");

fs.writeFileSync('src/components/Layout.tsx', code);
console.log("Fixed userProfile.id");
