import React, { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Capacitor } from '@capacitor/core';

export default function SmsGatewayListener() {
  const { userProfile, isAdmin } = useAuth();
  const channelRef = useRef<any>(null);

  useEffect(() => {
    // Only run if this specific device is marked as the Gateway
    const isGateway = localStorage.getItem('isSmsGateway') === 'true';
    const targetAdminId = isAdmin ? userProfile?.uid : userProfile?.adminId;
    
    if (!isGateway || !targetAdminId) return;

    console.log('📱 SMS Gateway Iniciado: Escutando fila de disparos...');

    const processSms = async (newSms: any) => {
      // Extra layer of security: only process SMS for our admin group
      if (newSms.admin_id !== targetAdminId) return;

      console.log('🔔 Processando SMS:', newSms);
      
      try {
        // 1. Double check if it is still pending (avoids race condition if clicked twice)
        const { data: checkData } = await supabase.from('sms_queue').select('status').eq('id', newSms.id).single();
        if (checkData?.status !== 'pending') return;

        // 2. Mark as sending to prevent duplicate processing
        await supabase
          .from('sms_queue')
          .update({ status: 'sending' })
          .eq('id', newSms.id);

        if (Capacitor.isNativePlatform()) {
          if ((window as any).sms) {
             await new Promise((resolve, reject) => {
               // A) Timeout protection: Se o chip travar por 10 seg, aborta e não trava o app
               const timeout = setTimeout(() => reject(new Error('Timeout da operadora ao enviar SMS')), 10000);
               
               const options = {
                  replaceLineBreaks: false, 
                  android: { intent: '' } // SILENT background send
               };
               
               (window as any).sms.send(newSms.phone_number, newSms.message, options, () => {
                 clearTimeout(timeout);
                 resolve(true);
               }, (err: any) => {
                 clearTimeout(timeout);
                 reject(err);
               });
             });
             
             // B) Rate Limiting Anti-Spam: Espera 2 segs antes de pegar a próxima da fila
             await new Promise(r => setTimeout(r, 2000));

          } else {
             console.warn('Plugin de SMS não encontrado. Simulando envio...');
             await new Promise(r => setTimeout(r, 1000)); 
          }
        } else {
          console.log(`🌐 Ambiente Web: Simulando envio de SMS para ${newSms.phone_number}`);
          await new Promise(r => setTimeout(r, 1000));
        }

        // 3. Update as successfully sent
        await supabase
          .from('sms_queue')
          .update({ status: 'sent' })
          .eq('id', newSms.id);
          
        console.log(`✅ SMS enviado com sucesso para ${newSms.phone_number}`);

      } catch (error: any) {
        console.error('❌ Falha ao enviar SMS:', error);
        // Mark as error so we know it failed
        await supabase
          .from('sms_queue')
          .update({ status: 'error', error_message: error.message || 'Erro desconhecido' })
          .eq('id', newSms.id);
      }
    };

    // FUNÇÃO A: Varredura de Fila (Caso o app estivesse fechado ou tela bloqueada)
    const processBacklog = async () => {
      try {
        const { data: pendingSms } = await supabase
          .from('sms_queue')
          .select('*')
          .eq('admin_id', targetAdminId)
          .eq('status', 'pending');
          
        if (pendingSms && pendingSms.length > 0) {
          console.log(`📦 Encontrou ${pendingSms.length} SMS presos na fila. Processando...`);
          for (const sms of pendingSms) {
             await processSms(sms);
          }
        }
      } catch (e) {
        console.error('Erro ao processar backlog de SMS:', e);
      }
    };

    // Aciona a varredura assim que o componente monta
    processBacklog();

    // FUNÇÃO B: Escuta em Tempo Real (Caso o app esteja aberto)
    const setupListener = async () => {
      channelRef.current = supabase
        .channel('sms_queue_listener_' + targetAdminId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'sms_queue',
            filter: `status=eq.pending`
          },
          async (payload) => {
            await processSms(payload.new);
          }
        )
        .subscribe((status) => {
           console.log('📡 Status do Servidor de SMS:', status);
        });
    };

    setupListener();

    return () => {
      if (channelRef.current) {
        console.log('Desconectando listener de SMS...');
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userProfile?.adminId, userProfile?.uid, isAdmin]);

  return null; // This is a purely background logic component
}
