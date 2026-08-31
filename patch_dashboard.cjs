const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf-8');

const isTrialStr = `  const isTrial = userProfile?.role === 'admin' && userProfile?.subscriptionStatus === 'trial';`;
const newIsTrialStr = `  const isTrial = userProfile?.role === 'admin' && userProfile?.subscriptionStatus === 'trial';

  const isExpiringSoon = () => {
    if (!userProfile?.subscriptionExpiresAt) return false;
    const expiresAt = new Date(userProfile.subscriptionExpiresAt);
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = diffTime / (1000 * 3600 * 24);
    return diffDays <= 1;
  };`;

code = code.replace(isTrialStr, newIsTrialStr);

const subStr = `            <div>
              <h3 className="font-bold text-blue-800">Assinatura Ativa</h3>
              <p className="text-sm text-blue-700">
                Sua mensalidade vence em: <span className="font-bold">{formatDate(userProfile.subscriptionExpiresAt)}</span>
              </p>
            </div>
          </div>
        </div>
      )}`;

const newSubStr = `            <div>
              <h3 className="font-bold text-blue-800">Assinatura Ativa</h3>
              <p className="text-sm text-blue-700">
                Sua mensalidade vence em: <span className="font-bold">{formatDate(userProfile.subscriptionExpiresAt)}</span>
              </p>
            </div>
          </div>
          {isExpiringSoon() && (
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
              <button
                onClick={handlePay}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center whitespace-nowrap"
              >
                <CreditCard size={18} className="mr-2" />
                Renovar Assinatura
              </button>
            </div>
          )}
        </div>
      )}`;

code = code.replace(subStr, newSubStr);

fs.writeFileSync('src/pages/Dashboard.tsx', code);
