export interface ReceiptData {
  clientName: string;
  clientPhone: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD or DD/MM/YYYY
  dueDate: string;     // YYYY-MM-DD or DD/MM/YYYY
  companyName?: string;
}

/**
 * Format date to DD/MM/YYYY
 */
export function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  if (dateStr.includes('/')) return dateStr;
  try {
    const clean = dateStr.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Format currency to R$ 0.00 (matching the reference image font style R$ 0.00 or R$ 350.00)
 */
export function formatReceiptCurrency(value: number): string {
  const num = Number(value || 0);
  return `R$ ${num.toFixed(2)}`;
}

/**
 * Generates a PNG Base64 Data URL matching the user's attached design
 * Card:
 * - Top title: "Recibo de Pagamento"
 * - Cliente (name, phone) on the left
 * - Valor Total (R$ X.XX) in emerald green on the right
 * - Divider line
 * - Data do Pagamento (left) | Vencimento Original (right)
 */
export async function generateReceiptImageBase64(data: ReceiptData): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const scale = 2; // High-DPI for crisp text
      const width = 640 * scale;
      const height = 330 * scale;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Não foi possível obter contexto 2D do Canvas');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // 1. Transparent or white canvas background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // 2. Card container with rounded corners and light border
      const pad = 16 * scale;
      const cardX = pad;
      const cardY = pad;
      const cardW = width - pad * 2;
      const cardH = height - pad * 2;
      const radius = 22 * scale;

      // Draw Rounded Rectangle Card
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cardX + radius, cardY);
      ctx.lineTo(cardX + cardW - radius, cardY);
      ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + radius);
      ctx.lineTo(cardX + cardW, cardY + cardH - radius);
      ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - radius, cardY + cardH);
      ctx.lineTo(cardX + radius, cardY + cardH);
      ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - radius);
      ctx.lineTo(cardX, cardY + radius);
      ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
      ctx.closePath();

      // Card Fill
      ctx.fillStyle = '#f8fafc'; // Crisp modern clean background
      ctx.fill();

      // Card Border
      ctx.lineWidth = 1.8 * scale;
      ctx.strokeStyle = '#e2e8f0'; // Slate-200
      ctx.stroke();
      ctx.restore();

      const innerX = cardX + 34 * scale;
      const innerW = cardW - 68 * scale;
      const innerRight = cardX + cardW - 34 * scale;

      // 3. Header title: "Recibo de Pagamento" (Requested by user: "adicione apenas 'Recibo de pagamento' encima da imagem")
      const headerTitleY = cardY + 34 * scale;
      ctx.font = `700 ${14 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = '#0284c7'; // Sky-600 elegant header accent
      ctx.textAlign = 'left';
      ctx.fillText('Recibo de Pagamento', innerX, headerTitleY);

      // 4. Section: Cliente (Left)
      const clientLabelY = headerTitleY + 38 * scale;
      ctx.font = `500 ${15 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = '#64748b'; // Slate-500
      ctx.textAlign = 'left';
      ctx.fillText('Cliente', innerX, clientLabelY);

      const clientNameY = clientLabelY + 28 * scale;
      ctx.font = `800 ${25 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = '#0f172a'; // Slate-900

      // Truncate name gracefully if excessively long
      let displayName = data.clientName || 'Cliente';
      const maxNameWidth = innerW * 0.58;
      if (ctx.measureText(displayName).width > maxNameWidth) {
        while (displayName.length > 3 && ctx.measureText(displayName + '...').width > maxNameWidth) {
          displayName = displayName.slice(0, -1);
        }
        displayName += '...';
      }
      ctx.fillText(displayName, innerX, clientNameY);

      const clientPhoneY = clientNameY + 24 * scale;
      ctx.font = `500 ${16 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = '#64748b'; // Slate-500
      ctx.fillText(data.clientPhone || '', innerX, clientPhoneY);

      // 5. Section: Valor Total (Right)
      const amountLabelY = clientLabelY;
      ctx.font = `500 ${15 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = '#64748b'; // Slate-500
      ctx.textAlign = 'right';
      ctx.fillText('Valor Total', innerRight, amountLabelY);

      const amountValueY = clientNameY + 4 * scale;
      ctx.font = `900 ${36 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = '#059669'; // Emerald-600
      ctx.textAlign = 'right';
      ctx.fillText(formatReceiptCurrency(data.amount), innerRight, amountValueY);

      // 6. Horizontal Divider Line
      const dividerY = clientPhoneY + 28 * scale;
      ctx.beginPath();
      ctx.moveTo(innerX, dividerY);
      ctx.lineTo(innerRight, dividerY);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.5 * scale;
      ctx.stroke();

      // 7. Bottom Left: Data do Pagamento
      const bottomLabelY = dividerY + 30 * scale;
      ctx.font = `500 ${14 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = '#64748b'; // Slate-500
      ctx.textAlign = 'left';
      ctx.fillText('Data do Pagamento:', innerX, bottomLabelY);

      const paymentDateY = bottomLabelY + 25 * scale;
      ctx.font = `800 ${20 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = '#0f172a'; // Slate-900
      ctx.fillText(formatDateBR(data.paymentDate || new Date().toISOString().split('T')[0]), innerX, paymentDateY);

      // 8. Bottom Right: Vencimento Original
      const bottomDueDateLabelY = bottomLabelY;
      ctx.font = `500 ${14 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = '#64748b'; // Slate-500
      const rightColX = innerX + innerW * 0.52;
      ctx.fillText('Vencimento Original:', rightColX, bottomDueDateLabelY);

      const dueDateValueY = paymentDateY;
      ctx.font = `800 ${20 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
      ctx.fillStyle = '#0f172a'; // Slate-900
      ctx.fillText(formatDateBR(data.dueDate || data.paymentDate), rightColX, dueDateValueY);

      // Return Base64 PNG
      const dataUrl = canvas.toDataURL('image/png', 0.95);
      resolve(dataUrl);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Downloads the base64 image as a PNG file
 */
export function downloadReceiptImage(base64DataUrl: string, fileName = 'recibo_pagamento.png'): void {
  try {
    const link = document.createElement('a');
    link.href = base64DataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (document.body.contains(link)) document.body.removeChild(link);
    }, 200);
  } catch (e) {
    console.error('Erro ao baixar imagem do recibo:', e);
  }
}

/**
 * Copies the base64 image to the user's system clipboard (PNG blob)
 */
export async function copyReceiptImageToClipboard(base64DataUrl: string): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      return false;
    }
    const res = await fetch(base64DataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
    return true;
  } catch (e) {
    console.warn('Clipboard write image failed, falling back:', e);
    return false;
  }
}
