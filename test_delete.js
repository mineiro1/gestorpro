const code = `
    try {
      await supabase.from('users').delete().eq('id', adminToDelete);
      fetchAdmins();
`
console.log("Supabase doesn't throw on error unless `.throwOnError()` is appended or we check `error`!");
