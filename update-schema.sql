-- Update clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS cpf_cnpj text,
ADD COLUMN IF NOT EXISTS monthly_price numeric,
ADD COLUMN IF NOT EXISTS base_due_day integer,
ADD COLUMN IF NOT EXISTS due_date text,
ADD COLUMN IF NOT EXISTS visit_days jsonb,
ADD COLUMN IF NOT EXISTS extra_visits jsonb,
ADD COLUMN IF NOT EXISTS pool_count integer,
ADD COLUMN IF NOT EXISTS extra_amount numeric,
ADD COLUMN IF NOT EXISTS extra_reason text,
ADD COLUMN IF NOT EXISTS active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS inactivated_at timestamp with time zone;

-- Update users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS client_id uuid,
ADD COLUMN IF NOT EXISTS password text,
ADD COLUMN IF NOT EXISTS custom_products jsonb default '[]'::jsonb,
ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- Update visits table
ALTER TABLE visits
ADD COLUMN IF NOT EXISTS photo_url text,
ADD COLUMN IF NOT EXISTS photo_urls jsonb;

-- Update payments table
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS base_amount numeric,
ADD COLUMN IF NOT EXISTS extra_amount numeric,
ADD COLUMN IF NOT EXISTS extra_reason text,
ADD COLUMN IF NOT EXISTS month integer,
ADD COLUMN IF NOT EXISTS year integer,
ADD COLUMN IF NOT EXISTS ref_month integer,
ADD COLUMN IF NOT EXISTS ref_year integer,
ADD COLUMN IF NOT EXISTS previous_due_date text;

-- Update oneoffjobs table
ALTER TABLE oneoffjobs
ADD COLUMN IF NOT EXISTS client_name text,
ADD COLUMN IF NOT EXISTS client_phone text,
ADD COLUMN IF NOT EXISTS return_date text,
ADD COLUMN IF NOT EXISTS report text,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

-- Force PostgREST schema cache reload (Resolves "schema cache" errors)
NOTIFY pgrst, 'reload schema';

-- ROW LEVEL SECURITY (RLS) POLICIES
-- To avoid "new row violates row-level security policy" errors

-- Clients Table
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on clients" ON clients;
CREATE POLICY "Allow all operations for authenticated users on clients"
ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Users Table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on users" ON users;
CREATE POLICY "Allow all operations for authenticated users on users"
ON users FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Visits Table
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on visits" ON visits;
CREATE POLICY "Allow all operations for authenticated users on visits"
ON visits FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Payments Table
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on payments" ON payments;
CREATE POLICY "Allow all operations for authenticated users on payments"
ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Agenda Contacts Table
ALTER TABLE agenda_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on agenda_contacts" ON agenda_contacts;
CREATE POLICY "Allow all operations for authenticated users on agenda_contacts"
ON agenda_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- One Off Jobs Table
ALTER TABLE oneoffjobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on oneoffjobs" ON oneoffjobs;
CREATE POLICY "Allow all operations for authenticated users on oneoffjobs"
ON oneoffjobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
  id text primary key,
  monthlyPrice numeric,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on settings" ON settings;
CREATE POLICY "Allow all operations for authenticated users on settings"
ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

