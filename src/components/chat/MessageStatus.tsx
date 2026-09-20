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

  // If a client replied afterwards in the conversation, previous tech messages are marked as read
  const hasClientReplyAfter = allMessages.some(
    (other) =>
      other &&
      other.sender_type === 'client' &&
      new Date(other.created_at).getTime() >= new Date(msg.created_at).getTime()
  );

  if (hasClientReplyAfter) {
    return 'read';
  }

  const rawStatus = (meta.status || msg.status || '').toLowerCase().trim();
  if (rawStatus === 'read' || rawStatus === 'viewed' || rawStatus === 'played') {
    return 'read';
  }
  if (rawStatus === 'delivered' || rawStatus === 'received') {
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
        <CheckCheck size={size} className="text-[#53bdeb] font-bold ml-0.5" />
      </span>
    );
  }

  if (status === 'delivered') {
    return (
      <span
        title="Mensagem entregue (2 tiques cinzas)"
        className={`inline-flex items-center ${className}`}
        data-status="delivered"
      >
        <CheckCheck
          size={size}
          className={`${isBubbleOnPrimary ? 'text-gray-300' : 'text-gray-400'} ml-0.5`}
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
          className={`${isBubbleOnPrimary ? 'text-gray-300/80' : 'text-gray-400'} ml-0.5 animate-pulse`}
        />
      </span>
    );
  }

  // Default: 'sent' -> 1 grey tick
  return (
    <span
      title="Mensagem enviada (1 tique cinza)"
      className={`inline-flex items-center ${className}`}
      data-status="sent"
    >
      <Check
        size={size}
        className={`${isBubbleOnPrimary ? 'text-gray-300' : 'text-gray-400'} ml-0.5`}
      />
    </span>
  );
}
