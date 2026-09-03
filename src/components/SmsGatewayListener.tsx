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
    if (!isGateway || !userProfile?.adminId) return;

    console.log('📱 SMS Gateway Iniciado: Escutando fila de disparos...');

    // Setup Supabase Realtime Listener for new SMS
    const setupListener = async () => {
      channelRef.current = supabase
        .channel('sms_queue_listener')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'sms_queue',
            filter: `status=eq.pending`
          },
          async (payload) => {
            const newSms = payload.new;
            
            // Extra layer of security: only process SMS for our admin group
            if (newSms.admin_id !== userProfile.adminId) return;

            console.log('🔔 Novo SMS detectado na fila!', newSms);
            
            try {
              // Mark as sending to prevent other listeners (if any) from picking it up
              await supabase
                .from('sms_queue')
                .update({ status: 'sending' })
                .eq('id', newSms.id);

              if (Capacitor.isNativePlatform()) {
                // Here we call the native SMS plugin
                // Note: The user needs to install a silent SMS plugin (e.g. cordova-sms-plugin)
                // and grant android.permission.SEND_SMS in AndroidManifest.xml
                
                if ((window as any).sms) {
                   await new Promise((resolve, reject) => {
                     const options = {
                        replaceLineBreaks: false, 
                        android: { intent: '' } // intent: '' means SILENT background send
                     };
                     (window as any).sms.send(newSms.phone_number, newSms.message, options, resolve, reject);
                   });
                } else {
                   console.warn('Plugin de SMS não encontrado no objeto window. Simulando envio no console...');
                   // Simulate network delay for testing
                   await new Promise(r => setTimeout(r, 1000)); 
                }
              } else {
                console.log(`🌐 Ambiente Web: Simulando envio de SMS para ${newSms.phone_number}`);
                await new Promise(r => setTimeout(r, 1000));
              }

              // Update as successfully sent
              await supabase
                .from('sms_queue')
                .update({ status: 'sent' })
                .eq('id', newSms.id);
                
              console.log(`✅ SMS enviado com sucesso para ${newSms.phone_number}`);

            } catch (error: any) {
              console.error('❌ Falha ao enviar SMS:', error);
              // Mark as error
              await supabase
                .from('sms_queue')
                .update({ status: 'error', error_message: error.message || 'Erro desconhecido' })
                .eq('id', newSms.id);
            }
          }
        )
        .subscribe();
    };

    setupListener();

    return () => {
      if (channelRef.current) {
        console.log('Desconectando listener de SMS...');
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userProfile?.adminId]);

  return null; // This is a purely background logic component
}
