const fs = require('fs');
let code = fs.readFileSync('src/pages/SuperAdminPage.tsx', 'utf-8');

const replaceStr = `  const confirmDeleteAdmin = async () => {
    if (!adminToDelete) return;
    setProcessingId(adminToDelete);
    try {
      await supabase.from('visits').delete().eq('admin_id', adminToDelete);
      await supabase.from('payments').delete().eq('admin_id', adminToDelete);
      await supabase.from('agenda_contacts').delete().eq('admin_id', adminToDelete);
      await supabase.from('oneoffjobs').delete().eq('admin_id', adminToDelete);
      await supabase.from('clients').delete().eq('admin_id', adminToDelete);
      await supabase.from('users').delete().eq('admin_id', adminToDelete);

      const { error } = await supabase.from('users').delete().eq('id', adminToDelete);
      if (error) throw error;
      
      fetchAdmins();
      setDeleteModalOpen(false);
      setAdminToDelete(null);
    } catch (e: any) {
       console.error('Delete Admin Error:', e);
       alert('Falha ao excluir admin: ' + (e.message || 'Erro desconhecido.'));
    } finally {
      setProcessingId(null);
    }
  };`;

const searchRegex = /  const confirmDeleteAdmin = async \(\) => \{[\s\S]*?    \}\n  \};/;
code = code.replace(searchRegex, replaceStr);

fs.writeFileSync('src/pages/SuperAdminPage.tsx', code);
