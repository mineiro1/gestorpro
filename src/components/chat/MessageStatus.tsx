import React from 'react';
import { Check, CheckCheck, Clock } from 'lucide-react';

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';

/**
 * Extracts and maps message status ('sent', 'delivered', 'read') from message payload and media_url metadata
 */
export function parseMessageStatus(msg: any, allMessages: any[] = []): MessageDeliveryStatus {
  if (!msg) return 'sent';
  
  let meta: any = {};
  if (msg.media_url && typeof msg.media_url === 'string' && msg.media_url.trim().startsWith('{') && msg.media_url.trim().endsWith('}')) {
    try {
      meta = JSON.parse(msg.media_url);
    } catch (e) {}
  } else if (typeof msg.media_url === 'object' && msg.media_url !== null) {
    meta = msg.media_url;
  }

  // Se o cliente respondeu após esta mensagem, marca mensagens anteriores do técnico como lidas
  if (Array.isArray(allMessages) && allMessages.length > 0) {
    const currentMsgTime = new Date(msg.created_at).getTime();
    const hasClientReplyAfter = allMessages.some(
      (other) =>
        other &&
        other.sender_type === 'client' &&
        new Date(other.created_at).getTime() >= currentMsgTime
    );

    if (hasClientReplyAfter) {
      return 'read';
    }
  }

  const rawStatus = String(meta.status || msg.status || '').toLowerCase().trim();
  if (rawStatus === 'read' || rawStatus === 'viewed' || rawStatus === 'played' || rawStatus === 'read_receipt' || rawStatus === '4' || rawStatus === '5') {
    return 'read';
  }
  if (rawStatus === 'delivered' || rawStatus === 'received' || rawStatus === 'delivery_ack' || rawStatus === '3') {
    return 'delivered';
  }
  if (rawStatus === 'sending' || rawStatus === 'pending') {
    return 'sending';
  }
  return 'sent';
}

interface MessageStatusProps {
  status: MessageDeliveryStatus | string;
  size?: number;
  className?: string;
  isBubbleOnPrimary?: boolean;
}

/**
 * Renders the WhatsApp style message status indicators:
 * - 'sending': Clock icon (pending)
 * - 'sent': 1 grey tick (sent to servers)
 * - 'delivered': 2 grey ticks (delivered to recipient device)
 * - 'read': 2 blue ticks (viewed/read by recipient)
 */
export function MessageStatus({
  status,
  size = 15,
  className = '',
  isBubbleOnPrimary = false
}: MessageStatusProps) {
  if (status === 'read') {
    return (
      <span
        title="Mensagem lida (2 tiques azuis)"
        className={`inline-flex items-center ${className}`}
        data-status="read"
      >
        <CheckCheck size={size} className="text-[#38bdf8] font-bold ml-0.5 drop-shadow-xs" />
      </span>
    );
  }

  if (status === 'delivered') {
    return (
      <span
        title="Mensagem entregue (2 tiques)"
        className={`inline-flex items-center ${className}`}
        data-status="delivered"
      >
        <CheckCheck
          size={size}
          className={`${isBubbleOnPrimary ? 'text-blue-200/90' : 'text-gray-400'} ml-0.5`}
        />
      </span>
    );
  }

  if (status === 'sending') {
    return (
      <span
        title="Enviando..."
        className={`inline-flex items-center ${className}`}
        data-status="sending"
      >
        <Clock
          size={Math.max(10, size - 3)}
          className={`${isBubbleOnPrimary ? 'text-blue-200/80' : 'text-gray-400'} ml-0.5 animate-pulse`}
        />
      </span>
    );
  }

  // Default: 'sent' -> 1 tick
  return (
    <span
      title="Mensagem enviada (1 tique)"
      className={`inline-flex items-center ${className}`}
      data-status="sent"
    >
      <Check
        size={size}
        className={`${isBubbleOnPrimary ? 'text-blue-200/90' : 'text-gray-400'} ml-0.5`}
      />
    </span>
  );
}
