const fs = require('fs');

let content = fs.readFileSync('src/pages/RoutesPage.tsx', 'utf8');

const fetchStatusRegex = /useEffect\(\(\) => \{\n    if \(\!generated \|\| \!userProfile \|\| \!routeDate\) return;[\s\S]*?\}, \[generated, routeDate, userProfile, isAdmin, refreshTrigger\]\);/g;

content = content.replace(fetchStatusRegex, `
  const { data: queryData, isLoading, refetch } = useQuery({
    queryKey: ['routeData', routeDate, selectedEmployee, selectedDay, userProfile?.uid, generated],
    enabled: generated && !!userProfile && !!routeDate && !!selectedEmployee,
    refetchInterval: 15000, // Substitui o autoRefresh manual
    queryFn: async () => {
      const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
      
      const { data: clientsDataAPI, error: cErr } = await supabase.from('clients')
        .select('*')
        .eq('admin_id', adminId)
        .eq('employee_id', selectedEmployee);
        
      if (cErr) throw cErr;
      const allEmployeeClients = (clientsDataAPI || []).map(doc => ({ ...doc, isOneOffJob: false }));
      
      const clientsData = allEmployeeClients.filter((client: any) => {
        if (client.active === false) return false;
        let visitDays = [];
        try { visitDays = Array.isArray(client.visit_days) ? client.visit_days : (client.visit_days ? JSON.parse(client.visit_days) : []); } catch(e) {}
        let extraVisits = [];
        try { extraVisits = Array.isArray(client.extra_visits) ? client.extra_visits : (client.extra_visits ? JSON.parse(client.extra_visits) : []); } catch(e) {}
        
        const matchesDayOfWeek = selectedDay ? (visitDays.includes(selectedDay)) : false;
        const matchesExtraVisit = routeDate ? (extraVisits.includes(routeDate)) : false;
        return matchesDayOfWeek || matchesExtraVisit;
      });
      
      // Fetch OneOffJobs
      const { data: jobsSnap, error: jErr } = await supabase.from('oneoffjobs')
        .select('*')
        .eq('admin_id', adminId)
        .eq('employee_id', selectedEmployee);
      if (jErr) throw jErr;
      
      const allJobs = (jobsSnap || []).map(doc => ({ 
        ...doc, 
        isOneOffJob: true,
        name: doc.client_name,
        phone: doc.client_phone
      })) as any[];
      
      const [y, m, d] = routeDate.split('-').map(Number); const currentDayOfWeek = new Date(y, m - 1, d).getDay().toString();
      const routeOrderName = 'system_route_order_' + currentDayOfWeek;
      const orderJob = jobsSnap?.find(job => job.client_name === routeOrderName);
      let savedOrder = [];
      if (orderJob && orderJob.description) {
        try { savedOrder = JSON.parse(orderJob.description); } catch(e) {}
      }

      const filteredJobs = allJobs.filter((job: any) => {
        if (job.client_name?.startsWith('system_route_order')) return false;
        const matchesDate = job.date === routeDate || (job.date && job.date.startsWith(routeDate));
        const matchesReturnDate = job.return_date === routeDate || (job.return_date && job.return_date.startsWith(routeDate));
        return (matchesDate || matchesReturnDate) && job.status !== 'cancelado';
      });

      const mergedClients = [...clientsData, ...filteredJobs];
      
      if (savedOrder.length > 0) {
        mergedClients.sort((a, b) => {
          const indexA = savedOrder.indexOf(a.id);
          const indexB = savedOrder.indexOf(b.id);
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return 0;
        });
      }

      // Check which clients were already visited ON THE ROUTE DATE
      const activeRouteDate = routeDate || getLocalISODate();
      const [year, month, day] = activeRouteDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, 0, 0, 0);
      const end = new Date(year, month - 1, day, 23, 59, 59, 999);
      const routeDateStartStr = start.toISOString();
      const routeDateEndStr = end.toISOString();
      
      const { data: visitsByTime } = await supabase.from('visits')
        .select('client_id')
        .eq('admin_id', adminId)
        .eq('time', activeRouteDate);
        
      const { data: visitsByDate } = await supabase.from('visits')
        .select('client_id')
        .eq('admin_id', adminId)
        .gte('date', routeDateStartStr)
        .lte('date', routeDateEndStr);
        
      const { data: visitsByCreated } = await supabase.from('visits')
        .select('client_id')
        .eq('admin_id', adminId)
        .gte('created_at', routeDateStartStr)
        .lte('created_at', routeDateEndStr);
        
      const visitsSnap = [...(visitsByTime || []), ...(visitsByDate || []), ...(visitsByCreated || [])];
        
      const completedIds = new Set();
      if (visitsSnap) {
        visitsSnap.forEach(data => {
            completedIds.add(data.client_id);
        });
      }
      
      filteredJobs.forEach(job => {
        const updatedAtDate = job.updated_at ? new Date(job.updated_at) : null;
        const routeDateStart = new Date(routeDateStartStr);
        const routeDateEnd = new Date(routeDateEndStr);
        const updatedToday = updatedAtDate && updatedAtDate >= routeDateStart && updatedAtDate <= routeDateEnd;
        if (job.status === 'concluido' || (job.status === 'em_andamento' && updatedToday)) {
            if ((job.date && job.date.startsWith(activeRouteDate) && job.status !== 'pendente') || (job.return_date && job.return_date.startsWith(activeRouteDate) && job.status === 'concluido') || updatedToday) {
                completedIds.add(job.id);
            }
        }
      });
      
      return { clients: mergedClients, completed: completedIds };
    }
  });

  const routeClients = queryData?.clients || [];
  const completedVisitsOnRouteDate = queryData?.completed || new Set();

  useEffect(() => {
    if (!generated || !userProfile || !routeDate) return;
    const adminId = isAdmin ? userProfile.uid : userProfile.adminId;
    let jobFilter = \`admin_id=eq.\${adminId}\`;
    if (!isAdmin && !isManager) jobFilter += \`&employee_id=eq.\${userProfile.uid}\`;

    const channel1 = supabase.channel('routes-visits')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visits', filter: \`admin_id=eq.\${adminId}\` }, () => refetch())
      .subscribe();

    const channel2 = supabase.channel('routes-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oneoffjobs', filter: jobFilter }, (payload) => {
        refetch();
        if (payload.new && payload.new.client_name && payload.new.client_name.startsWith('system_route_order_')) {
          if (!isAdmin) setRouteOrderChanged(true);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, [generated, routeDate, userProfile, isAdmin]);
`);

const autoRefreshRegex = /\/\/ Auto-refresh the route if it's already generated[\s\S]*?}, \[refreshTrigger\]\);/g;
content = content.replace(autoRefreshRegex, "");

const handleGenerateRouteRegex = /const handleGenerateRoute = async \(silent = false\) => \{[\s\S]*?\} finally \{\n      setLoading\(false\);\n    \}\n  \};\n/g;
content = content.replace(handleGenerateRouteRegex, `
  const handleGenerateRoute = () => {
    if (!selectedEmployee || (!selectedDay && !routeDate) || !userProfile) return;
    setGenerated(true);
  };
`);

// Also we need to fix the mutation on processReportSubmission.
const processReportRegex = /setCompletedVisitsOnRouteDate\(prev => new Set\(prev\)\.add\(selectedClientForReport\.id\)\);/g;
content = content.replace(processReportRegex, `
      queryClient.setQueryData(['routeData', routeDate, selectedEmployee, selectedDay, userProfile?.uid, generated], (old) => {
        if (!old) return old;
        const nextSet = new Set(old.completed);
        nextSet.add(selectedClientForReport.id);
        return { ...old, completed: nextSet };
      });
      queryClient.invalidateQueries({ queryKey: ['routeData'] });
`);

// And the loading prop in the button should use isLoading from react-query
// It uses `loading`. We removed `loading` state, but let's see.
content = content.replace(/loading \? 'Gerando\.\.\.' \: 'Gerar Rota'/g, "isLoading ? 'Gerando...' : 'Gerar Rota'");
content = content.replace(/disabled=\{\!selectedEmployee \|\| \(\!selectedDay \&\& \!routeDate\) \|\| loading\}/g, "disabled={!selectedEmployee || (!selectedDay && !routeDate) || isLoading}");


fs.writeFileSync('src/pages/RoutesPage.tsx', content);

